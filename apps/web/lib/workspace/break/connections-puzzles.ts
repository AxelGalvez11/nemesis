// Hand-written grouping puzzles, easiest group first (index picks the tone in
// the UI: 0 straightforward → 3 wordplay). Field-agnostic general knowledge —
// a law student and an engineering student get the same fair shot. Validated
// mechanically by the tests (4×4, no overlaps, unique titles).

import type { ConnectionsPuzzle } from "./connections";

export const CONNECTIONS_PUZZLES: ConnectionsPuzzle[] = [
  {
    groups: [
      { title: "Ways to study", items: ["Cram", "Review", "Quiz", "Drill"] },
      { title: "___ break", items: ["Coffee", "Lunch", "Spring", "Commercial"] },
      { title: "Things with keys", items: ["Piano", "Laptop", "Florida", "Jailer"] },
      { title: "___ hall", items: ["Study", "City", "Music", "Mess"] },
    ],
  },
  {
    groups: [
      { title: "Chess pieces", items: ["King", "Queen", "Bishop", "Rook"] },
      { title: "Kinds of tea", items: ["Green", "Chamomile", "Oolong", "Chai"] },
      { title: "Shades of blue", items: ["Navy", "Royal", "Powder", "Steel"] },
      { title: "Fast ___", items: ["Food", "Forward", "Break", "Lane"] },
    ],
  },
  {
    groups: [
      { title: "Winter wear", items: ["Scarf", "Mitten", "Parka", "Beanie"] },
      { title: "Parts of a book", items: ["Spine", "Cover", "Chapter", "Margin"] },
      { title: "Core exercises", items: ["Plank", "Lunge", "Squat", "Crunch"] },
      { title: "Punches", items: ["Jab", "Hook", "Cross", "Uppercut"] },
    ],
  },
  {
    groups: [
      { title: "Big cats", items: ["Lion", "Tiger", "Jaguar", "Cougar"] },
      { title: "Birds", items: ["Cardinal", "Oriole", "Jay", "Robin"] },
      { title: "Golf scores", items: ["Par", "Birdie", "Eagle", "Bogey"] },
      { title: "Number homophones", items: ["Won", "Too", "Fore", "Ate"] },
    ],
  },
  {
    groups: [
      { title: "Pizza toppings", items: ["Olive", "Pepperoni", "Mushroom", "Onion"] },
      { title: "Herbs", items: ["Basil", "Thyme", "Rosemary", "Dill"] },
      { title: "Shades of green", items: ["Sage", "Forest", "Mint", "Lime"] },
      { title: "___ chocolate", items: ["Dark", "Milk", "Hot", "White"] },
    ],
  },
  {
    groups: [
      { title: "Study spots", items: ["Library", "Cafe", "Dorm", "Lawn"] },
      { title: "Things that buzz", items: ["Bee", "Alarm", "Phone", "Doorbell"] },
      { title: "Honey ___", items: ["Moon", "Comb", "Dew", "Crisp"] },
      { title: "Full ___", items: ["House", "Stop", "Time", "Circle"] },
    ],
  },
  {
    groups: [
      { title: "Playing cards", items: ["Ace", "Jack", "Queen", "Joker"] },
      { title: "British slang", items: ["Mate", "Quid", "Cheeky", "Bloke"] },
      { title: "___ pot", items: ["Tea", "Crack", "Hot", "Stock"] },
      { title: "___ corn", items: ["Uni", "Pop", "Capri", "Pepper"] },
    ],
  },
  {
    groups: [
      { title: "Roman gods", items: ["Mars", "Venus", "Neptune", "Jupiter"] },
      { title: "Candy bars", items: ["Twix", "Snickers", "KitKat", "Rolo"] },
      { title: "Chemical elements", items: ["Mercury", "Gold", "Neon", "Carbon"] },
      { title: "Things you pump", items: ["Iron", "Gas", "Brakes", "Volume"] },
    ],
  },
  {
    groups: [
      { title: "Newspaper sections", items: ["Sports", "Opinion", "Arts", "Business"] },
      { title: "Yoga poses", items: ["Cobra", "Warrior", "Tree", "Crow"] },
      { title: "Snakes", items: ["Viper", "Mamba", "Python", "Boa"] },
      { title: "Kinds of columns", items: ["Doric", "Ionic", "Advice", "Spinal"] },
    ],
  },
  {
    groups: [
      { title: "Times of day", items: ["Dawn", "Dusk", "Midnight", "Twilight"] },
      { title: "Boats", items: ["Canoe", "Ferry", "Yacht", "Dinghy"] },
      { title: "Palindromes", items: ["Level", "Kayak", "Radar", "Noon"] },
      { title: "RAT hiding inside", items: ["Crate", "Pirate", "Marathon", "Grateful"] },
    ],
  },
  {
    groups: [
      { title: "Breakfast foods", items: ["Waffle", "Bagel", "Omelet", "Cereal"] },
      { title: "Flying machines", items: ["Jet", "Glider", "Blimp", "Chopper"] },
      { title: "Ramble on", items: ["Babble", "Rant", "Drone", "Prattle"] },
      { title: "Seen at a wedding", items: ["Toast", "Vows", "Bouquet", "Rings"] },
    ],
  },
  {
    groups: [
      { title: "Gym class games", items: ["Dodgeball", "Kickball", "Tag", "Relay"] },
      { title: "Price ___", items: ["War", "Point", "Range", "Check"] },
      { title: "Parts of a graph", items: ["Axis", "Origin", "Slope", "Curve"] },
      { title: "___ story", items: ["Cover", "Ghost", "Tall", "Sob"] },
    ],
  },
];
