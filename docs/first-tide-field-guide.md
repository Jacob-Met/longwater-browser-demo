# Reading the first tide: a Longwater field guide

A button describes your action; the **After** readings describe the whole tide. Between those two, the tide event and dawn drift also change the marsh. Reading the complete field notes helps explain why the final numbers can surprise you.

This guide compares **three separate first-tide choices at Heart Pool**, each starting from the same fresh opening. Gate, Shade and Seed below are alternatives, not a three-turn sequence. The numbers come from retained native game results for the version linked at the end.

## Try the comparison without changing your active watch

1. Choose **Open practice** below the marsh. Check that the dialog says **PRACTICE · SEPARATE WATCH** and **Opening practice readings**. Its summary should show **Practice tide 0 / 14**, **Water 5** and **Seed packs 5**. **Heart Pool** starts selected; verify that selection before acting.
2. Choose **Gate** once. An accepted press immediately resolves one complete practice tide. Check the success message and **Practice tide 1 / 14**, then read **Latest practice result · tide 1**. Inspect the resources, all three cell tables, and the event and complete field notes below them.
3. Note the result before continuing. Practice shows only the latest before-and-after result; restarting or taking another accepted action replaces that display. It does not add these trials to your active watch's journal.
4. Choose **Restart practice**. Confirm that the restart succeeded: **Opening practice readings**, tide 0, Water 5, Seed packs 5, Heart Pool selected, and the opening values in the table below. Then choose **Shade** once, check tide 1, and note that result.
5. Restart and verify the same opening again. Choose **Seed** once, check tide 1, and note the third result.
6. Choose **Close practice**, or press Escape, to return to your active watch. Closing discards the temporary practice; reopening starts fresh rather than resuming it.

Use the visible practice buttons, or Tab followed by Enter or Space. Selecting a practice cell alone does not advance a tide. The main game's letter shortcuts are not needed for this exercise.

**Restart practice is not the main game's Reset.** Main Reset opens a review for replacing the active watch, its journal and saved progress; you do not need it here. Practice uses its own temporary watch and does not spend the active watch's resources, change its selected cell, add journal entries or write saved progress.

If practice cannot open or restart, do not assume you have a fresh opening: check the status and stop the comparison if the opening cannot be verified. An unavailable action reports a refusal without advancing the tide; the previous result may still be visible, so do not record it as a new success. Do not reload the page merely to restart practice: your active watch may have progress that was not saved.

## The recorded opening and results

These are Heart Pool's displayed readings. **Life** is the game's biomass reading; Canopy is a level out of 3. Depth is in centimetres, salt in parts per thousand (ppt), and Oxygen and Life are percentages.

| Heart Pool | Depth (cm) | Salt (ppt) | Oxygen (%) | Life (%) | Canopy (of 3) |
|---|---:|---:|---:|---:|---:|
| Fresh opening, tide 0 | 56 | 30 | 55 | 49 | 0 |
| First tide with Gate | 77 | 24 | 51 | 49 | 0 |
| First tide with Shade | 70 | 32 | 58 | 53 | 1 |
| First tide with Seed | 70 | 34 | 55 | 62 | 0 |

All three recorded first tides have the **Spring tide** event. Each is still an unfinished watch, with no final outcome.

The resources are counts, not litres or other physical quantities:

| Separate trial | Water remaining | Seed packs remaining |
|---|---:|---:|
| Fresh opening | 5 | 5 |
| First tide with Gate | 4 | 5 |
| First tide with Shade | 5 | 5 |
| First tide with Seed | 5 | 4 |

The controls describe those costs: Gate says **Spend 1 water**, Shade says **Add canopy, up to 3**, and Seed says **Spend 1 seed pack**. Shade uses neither resource in this opening example, but its accepted action still spends one practice tide.

## Gate: a lower final oxygen reading has an explanation

At Heart Pool, the recorded Gate action changes depth from 56 to 63 cm, salt from 30 to 20 ppt, and oxygen from 55% to 54%. It uses one water.

The Spring tide then adds 14 cm of depth and 4 ppt of salt, and moves oxygen from 54% to 51%. The recorded dawn adds no oxygen or Life and makes no further salt change in this trial.

So the final readings follow these steps:

- Depth: 56 + 7 + 14 = **77 cm**.
- Salt: 30 − 10 + 4 + 0 = **24 ppt**.
- Oxygen: 55 − 1 − 3 + 0 = **51%**.

Oxygen has fallen by **4 percentage points** over the whole tide. That is not a four-point immediate Gate effect: the report separates the action's one-point decrease from the event's three-point decrease. Life remains 49%.

## Shade: why salt rises despite the action lowering it

The recorded Shade action raises canopy from 0 to 1 and lowers Heart Pool's salt from 30 to 28 ppt. The Spring tide then adds 4 ppt; dawn makes no further salt change.

**30 − 2 + 4 + 0 = 32 ppt.**

The final salt reading is therefore 2 ppt above the opening, even though the immediate action lowered it. Comparing only 30 with 32 would hide that distinction.

The same report separates the other changes:

- Oxygen: 55 → 59 after the action, then 56 after the tide event, then **58%** after dawn. The net change is +3 percentage points.
- Life: 49 → 52 from the action, then another point at dawn, ending at **53%**.

These are the recorded consequences of this opening choice. They do not establish how Shade will behave in every later state.

## Seed: no net oxygen change does not mean nothing happened

Seed uses one seed pack. In the recorded opening, reseeding raises Life from 49% to 61%; dawn adds one more point, producing **62%**. The field notes say the deep-water settling rule was not triggered in this trial.

Oxygen takes a less obvious path:

**55 → 56 after the action → 53 after the tide event → 55% after dawn.**

Its net change is zero, but the intermediate changes are not zero. A final reading alone cannot tell you that the action had no oxygen effect.

Seed's final depth of 70 cm and salt of 34 ppt are also whole-tide readings. They are not evidence that planting alone caused all of those changes.

## Read the marsh, not just the selected cell

The result includes all three cells because a tide advances the whole marsh. In all three retained examples, unselected North Bank moves from 34 to 48 cm depth and from 44% to 45% Life. Check North Bank and South Reach as well as Heart Pool, then use the complete field notes to distinguish what the report actually attributes to each phase.

The three choices also leave different resources and canopy. Those differences are worth noticing without declaring a winner. This one-tide comparison does not establish an optimal strategy or a better fourteen-tide outcome. It describes Longwater's game simulation, not measured real-world ecology.

When you return to an active watch at another tide, read its own starting values and notes. The opening table is a worked example, not a forecast for that different state.

## Where the example comes from

This guide uses the source version [`1a6590ae8bef03f71051d463ccd1881d3e733feb`](https://github.com/Jacob-Met/longwater-browser-demo/tree/1a6590ae8bef03f71051d463ccd1881d3e733feb). Its shipped simulation is the same WASM blob recorded by the earlier practice receiver.

- [Retained native opening and three independent first-tide results](https://github.com/Jacob-Met/longwater-browser-demo/blob/1a6590ae8bef03f71051d463ccd1881d3e733feb/docs/qualification/practice-watch-71826f7aa69e/native-initial/baseline-wasm.json)
- [Original source and simulation identities](https://github.com/Jacob-Met/longwater-browser-demo/blob/1a6590ae8bef03f71051d463ccd1881d3e733feb/docs/qualification/practice-watch-71826f7aa69e/native-initial/source-manifest.json)
- [Practice controls and result display at this source version](https://github.com/Jacob-Met/longwater-browser-demo/blob/1a6590ae8bef03f71051d463ccd1881d3e733feb/practice-watch.js)

The procedure follows the recorded source controls; the numerical examples reuse those historical returned results. No new playthrough, browser test or simulation run was performed to write this guide. A matching source identity does not establish which version a live page is currently serving.
