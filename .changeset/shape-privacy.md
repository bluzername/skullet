---
"skullet": patch
---

Remembered shapes no longer keep anyone's details.

#### New

- `persistence` option, to remember no shapes.

#### Improved

- Shapes stored across visits are now only the size and position of each bone and the colours of any card, and are used at the width they were stored at.

#### Fixed

- No text, links, labels, classes or other markup is stored across visits.
- `forgetShapes()` now reaches other open tabs and skeletons already mounted, and nothing on screen can save itself back.
