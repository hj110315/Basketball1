# Hoop Frenzy

A single-player arcade basketball shooter for the browser. Flick the ball into the hoop and score as much as you can before the buzzer.

## Play

Open `index.html` in a browser. No build step and no install needed. It works with a mouse or touch.

## How to play

- **Swipe up** to shoot. The swipe's **length** sets the power and its **direction** sets the aim.
- **2 points** for a basket, **3 points** for a swish (nothing but net).
- **On Fire:** make 3 in a row and every basket scores x2 until you miss.
- **Fire Time:** in the last 10 seconds every basket scores x2. This stacks with On Fire for x4.
- **Bonus time:** reach the target score before the buzzer to earn +15 seconds, once per game.
- **Levels:** every few points you level up. At higher levels the hoop slides side to side and speeds up, so aim ahead of it.
- Shots still in the air when the buzzer sounds still count.

| Difficulty | Aim assist | Hoop starts moving | Bonus target |
|------------|------------|--------------------|--------------|
| Easy       | Strong     | Level 2            | 35           |
| Medium     | Some       | Level 2            | 45           |
| Hard       | Minimal    | Level 1            | 50           |

The browser saves the top 10 scores for each difficulty.

**Keys:** `1` / `2` / `3` start Easy / Medium / Hard from the title screen. `P` or `Esc` pauses and `M` mutes.

## Code layout

```
index.html        page, menus and overlays
css/style.css     menu and overlay styling
js/main.js        game loop, state machine, rendering, scoring rules, difficulty settings
js/physics.js     ball flight, rim/backboard/floor collisions, basket detection
js/hoop.js        hoop movement and net animation
js/input.js       mouse/touch swipe detection
js/hud.js         scoreboard, popups, banners
js/audio.js       sound effects synthesized with the Web Audio API
js/storage.js     high scores (localStorage)
```

To tune a difficulty, edit the `DIFFICULTIES` table at the top of `js/main.js`:

- `powK` / `aimK` set how much of your swipe error reaches the ball. Lower is more forgiving.
- `powSnap` / `aimSnap` set the size of the forgiving zone around a perfect swipe.
