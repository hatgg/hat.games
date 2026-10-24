# Nose

A game about being a dog, which is to say a game about smelling.

You are the single eye where a dog's nose should be: a circular lens of light on a dark
field. Smells drift through the dark as coloured wisps. They are crisp near the centre of
the lens and smear into haze toward the rim, so you have to put your nose *on* a thing to
know it. Hold sniff to narrow the lens and sharpen everything inside it.

## The loop: a walk

Each walk is a procedurally generated patch of neighbourhood and lasts about four and a
half minutes. Then your human whistles, you get a summary, and the next walk begins.
Progress (EXP, rank, journal, the dogs you have met) carries over.

## What there is to smell

| Kind | What it is | How you read it |
| --- | --- | --- |
| **Trails** | Something moved through and left a line. Trunk leads to the source, branches thin out into dead ends. | Hold sniff on the trail: who, how long ago, and which way it went. Walk it to the source to find the thing. |
| **Creatures** | Trails whose source is alive. Squirrels, cats and rabbits bolt when you get close, leaving a hot fresh trail. | Chase the fresh trail. Catch up for extra EXP. |
| **Marks** | Pee-mail on posts, trees, hydrants and benches, from six recurring neighbourhood dogs. | Sniff the post: name, breed, mood, what they ate, how long ago. Press **M** to mark it yourself; next walk someone may mark right over you. |
| **Pools** | Low places where old smells settle in layers. | Sniff repeatedly to dig down: newest first, then older, then the bottom. |
| **Air** | Scents on the wind from far-off sources: a barbecue, a bakery, the bins, rain coming. The plume swings with the wind. | Sniff the plume to learn what it is, then follow it upwind to the source. |

Smells have **age**. Fresh ones are saturated, tight and quick. Old ones are grey, wide,
slow and sparse, and the smell-text says so ("Still warm." / "2 days old, nearly gone.").

## Supporting systems

- **Reading.** Hold sniff while roughly still on a smell. A ring fills over about a second,
  then a line of smell-text appears. Reading is the main source of EXP and journal entries.
- **The drift.** A faint glow on the rim leans toward the richest smell beyond the lens,
  stronger while sniffing, so you are never completely without a lead.
- **Wind.** Wanders slowly. Shown in the HUD. Air plumes stream with it; all wisps drift a little.
- **EXP and ranks.** Pup, Sniffer, Tracker, Hound, Bloodhound, Legend. Each rank widens the
  lens by 3 percent. Thresholds: 400, 1200, 2400, 4000, 6000.
- **Journal (J).** Everything you have ever smelled, with counts and the last line read.
  Dogs of the neighbourhood get their own section.
- **Save.** `localStorage`, key `nose.save`. Add `?seed=N` to the URL to replay a layout.

## Controls

WASD or arrows, or drag toward where you want to go. Hold **Space** or **Shift** to sniff
and read. **M** marks a post. **J** opens the journal. Touch devices get on-screen buttons.

## Tuning

Walk difficulty lives in `walkConfig`. EXP values live in `finishRead` and the find
handlers in `update`. Smell-text lives in the data tables at the top of `game.js`.
