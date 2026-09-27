const passages=[
['calm',0.24,'Warm piano above a soft, drifting pad',`The lighthouse had been empty for twenty years, but every morning Mara still walked the path that led to it. The sea lay flat beneath the September sky. Along the cliffs, the grass leaned toward the water as if listening to something only it could hear.

She carried coffee in her father's old flask. Its brass lid had a dent shaped like a crescent moon, the souvenir of a fishing trip neither of them ever described the same way. She sat on the low stone wall and watched the small boats leave the harbor. From this distance they seemed almost weightless.

There was nothing urgent about the morning. A gull landed beside her, considered the possibility of breakfast, and left disappointed. Down in the village, someone opened a bakery door, and for a moment the wind smelled of bread instead of salt. Mara closed her eyes. The world was going about its ordinary business, and for once she was content to let it.`],
['mysterious',0.53,'Sparse bell notes with a suspended, shadowy harmony',`That was when the light turned on.

It swept across her closed eyelids: a brief red warmth, gone before she could name it. Mara opened her eyes. Behind the clouded glass at the top of the tower, something moved. The lighthouse had no electricity. She knew this because she had helped disconnect it herself.

She stood and waited for the beam to return. Thirty seconds. A minute. Nothing. Then, from somewhere inside the stone, came three slow knocks.

The gate was unlocked. On the doorstep lay a fresh coil of rope, wet enough to leave a dark circle on the pale stone. There were footprints, too, but only one set. They began at the door and ended at the wall, where the ground fell away into open sea.

Mara called out. Her voice sounded small inside the tower. Far above her, the old mechanism began to turn.`],
['tense',0.88,'A low pulse and urgent, climbing minor arpeggios',`The door slammed behind her. Somewhere overhead a cable snapped, whipping against the inside of the tower with a sound like a rifle shot. Mara grabbed the handrail as the stairs shuddered beneath her feet.

Outside, the fog arrived all at once. It erased the harbor, the path, the village. Through the thick white silence came the deep horn of a ship, far too close to the rocks.

She climbed. The metal steps were slick. On the landing above, an inspection hatch banged open and shut. The beam flashed again, not toward the sea but straight down through the stairwell, illuminating a frayed cable pulled tight across the final doorway.

Another horn. Closer now.

Mara flattened herself against the wall and edged past the cable. Beyond it the great lens spun unevenly, its weight dragging the broken mechanism toward the edge of its mount. If it fell, there would be no light at all. She reached for the emergency brake.`],
['dark',0.94,'Deep, restrained drones under a distant dissonance',`The handle broke in her hand.

For an instant everything was terribly still. Then the lens tilted, slowly at first, and the room filled with the grinding of iron against stone. Mara stumbled backward. Glass burst against the wall where she had been standing.

The light went out.

In the darkness she could hear the sea striking the cliff far below. She could hear the ship's engine, the short urgent rhythm of its horn. And beneath those sounds she heard a memory: her father telling her that a lighthouse was not a promise that the sea was safe. It was a promise that someone was paying attention.

Her hands were shaking. There was blood on her sleeve, though she could not feel where it came from. The old lamp was gone. The village was invisible. For the first time in twenty years, she had come to the tower and found nothing familiar left inside it.

Then her fingers touched the brass lid of the flask.`],
['hopeful',0.68,'A gentle major harmony opening into luminous piano',`The maintenance cupboard still held a signal lamp. Its battery was almost dead, but almost was enough. Mara wedged the brass lid behind its bulb, angled the little reflector toward the window, and pressed the switch.

A narrow thread of light reached into the fog.

She flashed it three times. Waited. Three times again. Out on the water, the ship answered. Its engine changed pitch. Slowly, impossibly slowly, the sound began moving away from the rocks.

By the time the rescue crew climbed the stairs, sunlight was finding its way through the broken windows. One of them wrapped a blanket around her shoulders. Another looked at the small lamp, the battered flask, the wreckage of the great lens, and said nothing at all.

Later, on the path home, Mara stopped at the low wall. The harbor was visible again. The boats had returned. Someone would have to repair the tower, she thought. Someone would have to come back tomorrow.

For the first time, tomorrow did not feel like a repetition. It felt like a beginning.`]
];
export const demo={title:'The light that stayed',author:'An original Undertone short story',overallTone:'From quiet shores to gathering danger, and back to the light',source:'demo',sections:passages.map(([mood,intensity,musicPrompt,text],id)=>({id,mood,intensity,musicPrompt,text,energy:intensity*.8,brightness:mood==='dark'?.1:.6}))};
