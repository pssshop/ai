# pssshop.github.io/ai

A React + TypeScript app for viewing, analyzing, and building AI scripts for **Pixel Starships**.

## Features

### AI Builder

Create new AI scripts from scratch:
- Click **"Create AI"** in the sidebar
- Search to pick the crew/room to associate the AI with
- Click "Add Rules" to start searching AI conditions and actions

### Saving, Loading & Sharing
- **Saves in browser**: Drafts persist in localStorage until you delete them via the ✕ in the sidebar
- **Download JSON**: Export enriched JSON with design IDs and special keys for import
- **Version comparison**: Load up or create multiple versions of the same crew/room to compare rule sets

### User Experience
- **More Human Readable AI Summary**
  - **IF/THEN breakdowns**: See consolidated conditions for a group of AI
  - **Toggle summaries** with the brain icon (🧠) in the sidebar
- **Searchable dropdowns**: Filter hundreds of actions/conditions by typing

### Keyboard Controls
- **Escape**: Close any dropdown
- **Arrow keys**: Navigate dropdown options

#### Rapid Entry Workflow
1. Search Action
2. Use arrows to highlight your match
3. Tab
4. Search Condition
5. Use Arrows to highlight match
6. Tab
7. Press Enter to Add Rule
8. Press Enter again to add another Rule

## Data Format

The app imports/exports JSON files with this structure:

```json
{
    "name": "Example Name",
    "special": "HealRoomHp",      // For crew only
    "character_design_id": "123", // For crew
    "profile_sprite_id": 1234,    // For crew

    "room_design_id": "123",      // For rooms
    "image_sprite_id": 1234,     // For rooms

    "ai": [
        {
            "index": 0,
            "condition": "SomeCondition",
            "action": "SomeAction"
        }
    ]
}
```
