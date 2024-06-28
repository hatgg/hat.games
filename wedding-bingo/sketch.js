const prompts = [
  "Bouquet gets tossed 💐",
  "Groom loses his tie 🎩",
  "Champagne cork flies 🍾",
  "Dad’s dance move 🕺",
  "Slicing of the cake 🍰",
  "Lost shoe on dance floor 👠",
  "Bride sings a song 👰",
  "Cocktail spills 🍸",
  "Bride or groom photobombs a selfie 🥳",
  "Lost phone drama 📱",
  "Granny hits the dance floor 🕺",
  "Someone speaks in a fake accent 💬",
  "Surprise guest appearance 😱",
  "Late-night pizza order 🍕",
  "Unexpected couple spotted 💏",
  "Socrates compliments the Greeks 🇬🇷",
  "Bride or groom cries 😭",
  "Armenians dance the night away 🇦🇲",
  "Bride or groom changes outfit 👗",
  "Kids dancing wildly 🧒🕺",
  "Wedding hashtag confusion 📲",
  "Flash mob dance 🕺💃",
  "Guest caught napping 😴",
  "Selfie antics 🤳",
  "Bride's veil flies away 👰🌬️",
  "Awkward silence during speeches 🎤",
  "Unplanned fireworks surprise 🎆",
  "Mismatched socks revealed 👣",
  "Guests do the limbo 🚶‍♂️🚧",
  "Old college friends reunite 🤗",
  "Unexpected toast by a child 🥂👶",
];

const songPrompts = [
  "Danza Kuduro 🎤",
  "September 🕺",
  "Stayin' Alive 🎶",
  "Conga! 🐍",
  "Daddy Cool 💃",
  "Rasputin 🇷🇺",
  "Don't You Worry Child 💑",
  "Canned Heat 🔥",
  "Chop Suey! 🎸",
  "Gimme! Gimme! Gimme! 🎤",
  "Voulez-Vous 🕺💿",
  "Bella Ciao 🎭",
  "One More Time 🎧",
  "Metro Antistrofa 🎉",
  "Music Sounds Better With You 🎭",
  "B.Y.O.B. 🎸",
  "It Feels So Good 🙌",
  "We No Speak Americano 👶",
  "Rhythm of the Night 🌐",
  "Born Again (Babylonia) 📸",
  "Carnaval de São Vicente 🎶",
  "Daddy Yankee - Ella Me Levanto 🎤",
  "Warni Warni 🎉",
  "Lay All Your Love On Me 💃",
  "Destination Calabria 🎺",
];

function setup() {
  createCanvas(1024, 1024);
  background(255);
  textSize(24);
  textAlign(LEFT);
  let grid = generateBingoGrid();
  drawGrid(grid);
}

function generateBingoGrid() {
  let selectedPrompts = randomize(prompts).slice(0, 24); // Get 24 random prompts
  selectedPrompts.splice(12, 0, "Ring emoji 💍"); // Insert the ring emoji at the center
  return selectedPrompts;
}

function drawGrid(prompts) {
  let size = 204; // Each square is 204x204 pixels
  let angle = radians(-5); // Convert -15 degrees to radians
  textSize(30); // Adjust text size if necessary
  for (let i = 0; i < 5; i++) {
    for (let j = 0; j < 5; j++) {
      let x = j * size;
      let y = i * size;
      stroke(0);
      fill(240); // Light grey for squares
      rect(x, y, size, size);

      let promptText = prompts[i * 5 + j];
      let formattedText = breakText(promptText); // Correctly handle line breaks

      // Text transformation
      push(); // Save the current drawing state
      translate(x, y + size / 3); // Move the origin to the center of the box
      rotate(angle); // Rotate the grid
      fill(0); // Black text
      textAlign(LEFT); // Center the text alignment
      text(formattedText, 10, -20, size - 10, size - 10); // Draw text with some padding
      pop(); // Restore the original drawing state
    }
  }
}

function breakText(text) {
  let words = text.split(" ");
  let newText = "";
  let counter = 0;
  for (let i = 0; i < words.length; i++) {
    newText += words[i] + " ";
    counter++;
    if (counter === 3) {
      // Every three words, add a line break
      newText += "\n";
      counter = 0; // Reset counter after adding a line break
    }
  }
  return newText.trim();
}

function generateBingoGrid() {
  // Randomize the arrays separately
  let shuffledPrompts = randomize(prompts.slice());
  let shuffledSongPrompts = randomize(songPrompts.slice());

  // Get 18 regular prompts and 7 song prompts
  let selectedRegularPrompts = shuffledPrompts.slice(0, 18);
  let selectedSongPrompts = shuffledSongPrompts.slice(0, 7);

  // Combine both arrays
  let combinedPrompts = selectedRegularPrompts.concat(selectedSongPrompts);

  // Randomize the combined array to mix the order of song and regular prompts
  let finalPrompts = randomize(combinedPrompts);

  // Ensure exactly 25 unique prompts, you can adjust if necessary or handle edge cases
  return finalPrompts.slice(0, 25);
}

// Helper function to randomize an array
function randomize(array) {
  for (let i = array.length - 1; i > 0; i--) {
    let j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}
