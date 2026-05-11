# Back + Home Navigation Buttons

**Date:** 2026-05-10  
**Status:** Approved

## Summary

Add Back and Home icon buttons to the left side of the app header, before the breadcrumb section. Both buttons are contextual — hidden when not applicable.

## Location

`apps/dashboard/src/components/header.tsx`  
Buttons inserted as siblings before `.hd-crumb` div, inside `<header className="hd">`.

## Logic

Derived purely from `usePathname()` — no state, no history stack.

```ts
const segments = pathname.split("/").filter(Boolean);
const isHome   = segments.length === 0;
const isRoot   = segments.length <= 1;
const parentPath = "/" + segments.slice(0, -1).join("/");
```

### Home button
- Icon: `Icons.home`
- Hidden when: `isHome` (pathname is `/`)
- Action: `router.push("/")`

### Back button
- Icon: `Icons.right` with `rotate-180` Tailwind class (points left)
- Hidden when: `isHome || isRoot` (nothing to go back to)
- Action: `router.push(parentPath)`

## Visibility Matrix

| Path | Home | Back |
|------|------|------|
| `/` | hidden | hidden |
| `/agents` | shown | hidden |
| `/agents/abc` | shown | shown |
| `/agents/abc/sessions/1` | shown | shown |

## Styling

Use existing `hd-btn` class — same as Logout button. No new CSS required.

## Files Changed

- `apps/dashboard/src/components/header.tsx` — only file modified

## Out of Scope

- Browser history back (not requested)
- Clickable breadcrumb segments
- Any floating or page-level nav
