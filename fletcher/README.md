# Fletcher

Your personal cupid. Fletcher gets to know you over a text conversation, and will eventually meet other people's Fletchers to find your matches.

This version covers the onboarding chat, photo prompts, and the profile review screen where people choose what their Fletcher may share.

## Run it

It doesn't need a build step or any dependencies. The files are static, but they have to be served over HTTP because the scripts use ES modules:

```sh
python3 -m http.server 4173
# open http://localhost:4173
```

## Structure

| File | What it does |
| --- | --- |
| `index.html` | Page shell: the phone frame, header, thread and composer |
| `styles.css` | Design tokens and all styles |
| `js/cupid.js` | Fletcher's pixel sprites, drawn as mirrored grids and rendered as crisp SVG |
| `js/flow.js` | The interview script, photo prompts, share/private defaults, and Fletcher's intro |
| `js/photos.js` | Photo cropping, resizing, and on-device storage (IndexedDB) |
| `js/config.js` | The Google Sheet web-app URL that receives profiles and feedback |
| `js/demo.js` | The scripted "Fletcher meets Fletcher" demo, built from the user's Public items and a made-up match |
| `js/app.js` | State, rendering, typing cadence, the profile sheet, and the send-off |

## Notes

- Answers are saved in `localStorage` (`fletcher.onboarding.v2`) and photos in IndexedDB, both on the user's own device.
- On **Send off your Fletcher**, the written answers (not photos or texting samples) are posted to the Google Sheet in `js/config.js`, followed by a 1–5 rating, one suggestion, and any later notes. Each row has a `type` (`profile`, `feedback`, `note`) and an anonymous `id` that ties them together. Submissions that fail (for example, offline) are retried on the next visit.
- Photos are re-encoded through a canvas before saving, which removes EXIF data such as GPS location.
- Each answer is either **shared** (Fletcher may say it to other Fletchers) or **private** (used only to decide who's a good fit). When agent-to-agent conversations are built, the talking agent should receive only shared items.
- Progress is saved as you go. If you reload partway through, Fletcher picks up at the question you were on. **⋯ → Start over** clears it.
- After the send-off, a scripted demo shows Fletcher talking to a made-up match's Fletcher using only the user's Public items, then lets them ask preset questions. It's labeled as a demo; real matching isn't built yet.
- Fletcher's replies are hand-written and react to keywords. No model is connected yet. After the send-off, Fletcher tells the user plainly that the matchmaking network isn't live yet.
- To connect a real model later, replace each step's `react()` in `js/flow.js` with an async call. `say()` in `app.js` already handles the typing pauses.
