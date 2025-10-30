import { type KeyboardEvent, useMemo, useRef, useEffect, useState } from "react";
import type { Entity, Rule } from "@/types";
import { buildSegmentsForSubsystem, analyzeSegment, getRuleDisplayIndex, isSkip } from "@/utils";
import { transformNegation, summarizeRuleRequirements } from "@/utils";
import { humanizeSpecial, getAssetForName } from "@/utils";

interface DetailViewProps {
  entity: Entity;
  onRemove: () => void;
}

export function DetailView({ entity, onRemove }: DetailViewProps) {
  // Build segments from the entity's flat rules in original order. Each segment
  // is the sequence of rules up to and including a terminating non-skip action.
  const segments = useMemo(() => buildSegmentsForSubsystem(entity.flatRules), [entity.flatRules]);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const headerRef = useRef<HTMLDivElement | null>(null);
  const [isFixed, setIsFixed] = useState(false);
  const [headerHeight, setHeaderHeight] = useState(0);

  useEffect(() => {
    const header = headerRef.current;
    const container = containerRef.current;
    if (!header || !container) return;

    const topOffset = 0; // adjust if you have a global top bar
    const update = () => {
      const headerRect = header.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();

      if (headerRect.top <= topOffset && containerRect.bottom > topOffset + headerRect.height) {
        setIsFixed(true);
        setHeaderHeight(headerRect.height);

        header.style.position = "fixed";
        header.style.top = `${topOffset}px`;
        header.style.left = `${containerRect.left}px`;
        header.style.width = `${containerRect.width}px`;
        header.style.zIndex = "9999";
      } else {
        setIsFixed(false);
        setHeaderHeight(0);
        header.style.position = "";
        header.style.top = "";
        header.style.left = "";
        header.style.width = "";
        header.style.zIndex = "";
      }
    };

    const findScrollParent = (el: Element | null): Element | Window => {
      let cur = el?.parentElement;
      while (cur) {
        const style = getComputedStyle(cur);
        const overflowX = style.overflowX;
        const overflowY = style.overflowY;
        if (/(auto|scroll|overlay)/.test(overflowX) || /(auto|scroll|overlay)/.test(overflowY)) {
          return cur;
        }
        cur = cur.parentElement;
      }
      return window;
    };

    const scrollParent = findScrollParent(container);

    const addListeners = (target: Element | Window) => {
      (target as Window).addEventListener
        ? (target as Window).addEventListener("scroll", update, { passive: true })
        : (target as Element).addEventListener("scroll", update, { passive: true });
      (target as Window).addEventListener
        ? (target as Window).addEventListener("resize", update)
        : (target as Element).addEventListener("resize", update);
    };

    const removeListeners = (target: Element | Window) => {
      (target as Window).removeEventListener
        ? (target as Window).removeEventListener("scroll", update)
        : (target as Element).removeEventListener("scroll", update);
      (target as Window).removeEventListener
        ? (target as Window).removeEventListener("resize", update)
        : (target as Element).removeEventListener("resize", update);
    };

    addListeners(window);
    if (scrollParent && scrollParent !== window) addListeners(scrollParent);
    window.addEventListener("pss:columns-changed", update);
    update();

    return () => {
      removeListeners(window);
      if (scrollParent && scrollParent !== window) removeListeners(scrollParent);
      window.removeEventListener("pss:columns-changed", update);
    };
  }, [entity.id]);

  const rawSource = (entity.source as any) || {};
  const headerSpriteId = rawSource?.profile_sprite_id ?? rawSource?.image_sprite_id;
  const headerSpriteUrl = headerSpriteId
    ? `https://api.pixelstarships.com/FileService/DownloadSprite?spriteId=${headerSpriteId}`
    : undefined;

  const specialKey = rawSource?.special ?? null;
  const specialHuman = humanizeSpecial(specialKey) ?? specialKey;
  const specialIconUrl = specialHuman ? getAssetForName(specialHuman) : undefined;
  const sourceFileName = (rawSource as any)?.__sourceFile?.fileName as string | undefined;

  return (
    <div className="entityColumn" ref={containerRef}>
      <div className={`entityColumnHeader${isFixed ? " fixed" : ""}`} ref={headerRef}>
        <div className="entityHeaderTopRow">
          <div className="entityHeaderMain">
            {headerSpriteUrl ? (
              <img src={headerSpriteUrl} alt={`${entity.name} sprite`} className="entityHeaderAvatar" />
            ) : null}
            <div className="entityHeaderName" title={entity.name}>
              <div className="entityHeaderTitleRow">
                <span className="entityHeaderTitleText">{entity.name}</span>
                {specialHuman ? (
                  <span className="entitySpecialBadge" title={String(specialHuman)}>
                    {specialIconUrl ? <img src={specialIconUrl} alt={String(specialHuman)} className="specialIconHeader" /> : null}
                    <span className="entitySpecialName">{specialHuman}</span>
                  </span>
                ) : null}
              </div>
              {sourceFileName ? <div className="entitySourceSubtitle">{sourceFileName}</div> : null}
            </div>
            <div className="entityHeaderType">{entity.type}</div>
          </div>
          <div
            className="closeBtn"
            onClick={() => {
              onRemove();
              setTimeout(() => window.dispatchEvent(new Event("pss:columns-changed")), 0);
            }}
            role="button"
            tabIndex={0}
            onKeyDown={(event: KeyboardEvent<HTMLDivElement>) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onRemove();
                setTimeout(() => window.dispatchEvent(new Event("pss:columns-changed")), 0);
              }
            }}
          >
            ✕
          </div>
        </div>
      </div>

      {isFixed && <div aria-hidden style={{ height: headerHeight }} />}

      <div>
        {segments.map((segment, segIndex) => (
          <div className="segmentGroup" key={`segment-${segIndex + 1}`}>
            <div className="rawRuleList">
              {segment.rules.map((rule, ruleIndex) => {
                const rawCond = (rule.condition ?? "").trim();
                const condition = rawCond === "" ? "None" : rawCond.startsWith("!") ? transformNegation(rawCond.replace(/^!+/, "").trim()) : rawCond;
                const action = (rule.action ?? "").trim() || "(no action)";
                const skipClass = isSkip(rule) ? " rawRuleActionSkip" : "";
                const globalIndex = entity.flatRules.findIndex(r => r === rule);
                const displayIndex = getRuleDisplayIndex(rule, globalIndex >= 0 ? globalIndex : ruleIndex);
                const key = `${displayIndex}-${condition}-${action}-${segIndex}-${ruleIndex}`;
                return (
                  <div className="rawRuleRow segmentRule" key={key}>
                    <div className="rawRuleMain">
                      <span className="rawRuleIdx">{displayIndex}</span>
                      <span className="rawRuleCondition">{condition}</span>
                      <span className="rawRuleArrow">→</span>
                      <span className={`rawRuleAction${skipClass}`}>{action}</span>
                    </div>
                  </div>
                );
              })}

              {(() => {
                const analysis = analyzeSegment(segment);
                const requirementMap = new Map<string, string>();
                analysis.rules.forEach(ruleInsight => {
                  if (ruleInsight.isSkip) return;
                  const summary = summarizeRuleRequirements(ruleInsight);
                  if (summary) requirementMap.set(ruleInsight.displayIndex, summary);
                });

                const terminating = [...segment.rules].reverse().find(r => !isSkip(r));
                if (!terminating) return null;
                const termGlobalIndex = entity.flatRules.findIndex(r => r === terminating);
                const termDisplayIndex = getRuleDisplayIndex(terminating, termGlobalIndex >= 0 ? termGlobalIndex : 0);
                const termAction = (terminating.action ?? "").trim() || "(no action)";
                const termRequirement = requirementMap.get(termDisplayIndex);
                if (!termRequirement) return null;

                const parts = termRequirement.split(/\s+AND\s+/);
                return (
                  <div className="segmentSummaryBlock">
                    <div className="segmentSummaryText">
                      {parts.map((p, i) => (
                        <div className="segmentSummaryLine" key={`req-${i}`}>
                          <span className="segmentSummaryLabel">{i === 0 ? "IF" : "AND"}</span>
                          <span className="segmentSummaryContent">{` ${p}`}</span>
                        </div>
                      ))}
                      <div className="segmentSummaryLine">
                        <span className="segmentSummaryLabel">THEN</span>
                        <span className="segmentSummaryDo">{` ${termAction}`}</span>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
