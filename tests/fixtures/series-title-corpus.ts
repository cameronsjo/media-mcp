export interface SeriesTitleExpectation {
  cleanTitle: string;
  seriesName: string | null;
  seriesPosition: number | null;
}

export interface SeriesTitleFixture {
  id: string;
  title: string;
  expected: SeriesTitleExpectation;
  sourceUrl: string;
  sourceNote: string;
}

/**
 * Titles transcribed from public Open Library records. The source URL is
 * retained beside each title so a changed fixture can be checked against the
 * catalog record instead of being treated as an invented parser example.
 */
export const realSeriesTitleCorpus: readonly SeriesTitleFixture[] = [
  {
    id: 'hobbit-subtitle-or',
    title: 'The Hobbit or There and Back Again',
    expected: {
      cleanTitle: 'The Hobbit or There and Back Again',
      seriesName: null,
      seriesPosition: null,
    },
    sourceUrl: 'https://openlibrary.org/books/OL24209616M.json',
    sourceNote: 'Open Library title field is exactly "The Hobbit or There and Back Again".',
  },
  {
    id: 'hobbit-edition-title',
    title: 'The Hobbit',
    expected: {
      cleanTitle: 'The Hobbit',
      seriesName: null,
      seriesPosition: null,
    },
    sourceUrl: 'https://openlibrary.org/books/OL10236414M.json',
    sourceNote: 'Open Library title field is exactly "The Hobbit" for this edition record.',
  },
  {
    id: 'autobiography-henry-viii',
    title: 'The Autobiography Of Henry VIII',
    expected: {
      cleanTitle: 'The Autobiography Of Henry VIII',
      seriesName: null,
      seriesPosition: null,
    },
    sourceUrl: 'https://openlibrary.org/books/OL9737168M.json',
    sourceNote: 'Open Library title field is exactly "The Autobiography Of Henry VIII".',
  },
  {
    id: 'renaissance-audio-part',
    title: 'The Renaissance Part 1 of 2',
    expected: {
      cleanTitle: 'The Renaissance Part 1 of 2',
      seriesName: null,
      seriesPosition: null,
    },
    sourceUrl: 'https://openlibrary.org/books/OL12581465M.json',
    sourceNote: 'Open Library title field is exactly "The Renaissance Part 1 of 2".',
  },
  {
    id: 'george-orwell-biography',
    title: 'George Orwell, a life',
    expected: {
      cleanTitle: 'George Orwell, a life',
      seriesName: null,
      seriesPosition: null,
    },
    sourceUrl: 'https://openlibrary.org/books/OL4126721M.json',
    sourceNote: 'Open Library title field is exactly "George Orwell, a life".',
  },
  {
    id: 'spandau',
    title: 'Spandau',
    expected: {
      cleanTitle: 'Spandau',
      seriesName: null,
      seriesPosition: null,
    },
    sourceUrl: 'https://openlibrary.org/books/OL20940534M.json',
    sourceNote: 'Open Library title field is exactly "Spandau".',
  },
  {
    id: 'patton',
    title: 'Patton',
    expected: {
      cleanTitle: 'Patton',
      seriesName: null,
      seriesPosition: null,
    },
    sourceUrl: 'https://openlibrary.org/books/OL17922345M.json',
    sourceNote: 'Open Library title field is exactly "Patton".',
  },
  {
    id: 'curse',
    title: 'Curse',
    expected: {
      cleanTitle: 'Curse',
      seriesName: null,
      seriesPosition: null,
    },
    sourceUrl: 'https://openlibrary.org/books/OL37528863M.json',
    sourceNote: 'Open Library title field is exactly "Curse".',
  },
  {
    id: 'well-beloved-hyphenated-title',
    title: 'The well-beloved',
    expected: {
      cleanTitle: 'The well-beloved',
      seriesName: null,
      seriesPosition: null,
    },
    sourceUrl: 'https://openlibrary.org/books/OL2719292M.json',
    sourceNote: 'Open Library title field is exactly "The well-beloved".',
  },
  {
    id: 'casimir-bridge-dash-series',
    title: 'Casimir Bridge - Anghazi Series Book 1',
    expected: {
      cleanTitle: 'Casimir Bridge',
      seriesName: 'Anghazi Series',
      seriesPosition: 1,
    },
    sourceUrl: 'https://openlibrary.org/books/OL40047894M.json',
    sourceNote: 'Open Library title field is exactly "Casimir Bridge - Anghazi Series Book 1".',
  },
  {
    id: 'angels-punishment-dash-series',
    title: "Angel's Punishment - Punishment Series Book 1",
    expected: {
      cleanTitle: "Angel's Punishment",
      seriesName: 'Punishment Series',
      seriesPosition: 1,
    },
    sourceUrl: 'https://openlibrary.org/books/OL56168630M.json',
    sourceNote:
      'Open Library title field is exactly "Angel\'s Punishment - Punishment Series Book 1".',
  },
  {
    id: 'blue-flame-dash-nonseries',
    title: 'Blue Flame - Men of Fire Book 2',
    expected: {
      cleanTitle: 'Blue Flame - Men of Fire Book 2',
      seriesName: null,
      seriesPosition: null,
    },
    sourceUrl: 'https://openlibrary.org/books/OL24500846M.json',
    sourceNote: 'Open Library title field is exactly "Blue Flame - Men of Fire Book 2".',
  },
  {
    id: 'ana-dash-nonseries',
    title: 'Ana - The quiet Death of a Rebel',
    expected: {
      cleanTitle: 'Ana - The quiet Death of a Rebel',
      seriesName: null,
      seriesPosition: null,
    },
    sourceUrl: 'https://openlibrary.org/books/OL37840351M.json',
    sourceNote: 'Open Library title field is exactly "Ana - The quiet Death of a Rebel".',
  },
  {
    id: 'jacq-of-spades-part-series',
    title: 'The Jacq of Spades: Part 1 of the Red Dog Conspiracy',
    expected: {
      cleanTitle: 'The Jacq of Spades: Part 1 of the Red Dog Conspiracy',
      seriesName: null,
      seriesPosition: null,
    },
    sourceUrl: 'https://openlibrary.org/books/OL26830627M.json',
    sourceNote:
      'Open Library title field is exactly "The Jacq of Spades: Part 1 of the Red Dog Conspiracy".',
  },
  {
    id: 'covenant-part-series',
    title:
      'The Covenant of Abraham, Isaac, and Jacob, Part 1 of the Covenants in the Biblical Evolution Revolution Series',
    expected: {
      cleanTitle: 'The Covenant of Abraham, Isaac, and Jacob',
      seriesName: 'Covenants in the Biblical Evolution Revolution Series',
      seriesPosition: 1,
    },
    sourceUrl: 'https://openlibrary.org/books/OL32531681M.json',
    sourceNote:
      'Open Library title field is exactly "The Covenant of Abraham, Isaac, and Jacob, Part 1 of the Covenants in the Biblical Evolution Revolution Series".',
  },
];

const ol = (
  id: string,
  title: string,
  key: string,
  cleanTitle: string,
  seriesName: string | null,
  seriesPosition: number | null
): SeriesTitleFixture => ({
  id,
  title,
  expected: { cleanTitle, seriesName, seriesPosition },
  sourceUrl: `https://openlibrary.org/works/${key}.json`,
  sourceNote: `Open Library work title is exactly ${JSON.stringify(title)}.`,
});

/** More Open Library work titles: the dash and "Part N of" shapes in the wild. */
export const openLibraryFormatCorpus: readonly SeriesTitleFixture[] = [
  ol(
    'ol-snow-in-summer',
    'Snow in Summer - Yellow Wood Series Book 2',
    'OL28846113W',
    'Snow in Summer',
    'Yellow Wood Series',
    2
  ),
  ol(
    'ol-wild-temptations-comma',
    'Wild Temptations - Finding Harmony Series, Book 2',
    'OL29096850W',
    'Wild Temptations',
    'Finding Harmony Series',
    2
  ),
  ol(
    'ol-back-in-the-game-comma',
    'Back in the Game - Checkmate Series, Book 3',
    'OL29088000W',
    'Back in the Game',
    'Checkmate Series',
    3
  ),
  ol(
    'ol-scylla',
    'Scylla - Immortal War Series Book 4',
    'OL40276849W',
    'Scylla',
    'Immortal War Series',
    4
  ),
  ol(
    'ol-visions-the-series',
    'Visions - the Hawthorn Series Book 2',
    'OL40979160W',
    'Visions',
    'the Hawthorn Series',
    2
  ),
  ol(
    'ol-ritual-lowercase-series',
    'Ritual - Jack Caffery series Book 3',
    'OL31864708W',
    'Ritual',
    'Jack Caffery series',
    3
  ),
  ol(
    'ol-publisher-puzzle-series',
    'Genius Publishing 504 Word Search Puzzles and Solutions - Chill Series Book 5',
    'OL25520825W',
    'Genius Publishing 504 Word Search Puzzles and Solutions',
    'Chill Series',
    5
  ),
  // A subtitle with its own colon: the dash rule must not claim "a Party for the
  // True Hero : Vowel Team Series" as a series name. Only the position parses.
  ol(
    'ol-vowel-team-colon-subtitle',
    'Rescue at Green Avenue - a Party for the True Hero : Vowel Team Series, Book 5',
    'OL27089038W',
    'Rescue at Green Avenue - a Party for the True Hero : Vowel Team Series',
    null,
    5
  ),
  ol(
    'ol-covenant-shem-part-2',
    'Covenant of Shem, Esau, and Levi, Part 2 of the Covenants in the Biblical Evolution Revolution Series',
    'OL29135934W',
    'Covenant of Shem, Esau, and Levi',
    'Covenants in the Biblical Evolution Revolution Series',
    2
  ),
  // "the Series" names no series.
  ol(
    'ol-archivist-part-of-the-series',
    'Archivist of Feminine Intention, Part 1 of the Series',
    'OL38247506W',
    'Archivist of Feminine Intention, Part 1 of the Series',
    null,
    null
  ),
  ol(
    'ol-napoleon-parenthetical-part',
    'Napoleon (Part 1 of 2)',
    'OL1159236W',
    'Napoleon (Part 1 of 2)',
    null,
    null
  ),
];

const gr = (
  id: string,
  title: string,
  bookId: string,
  cleanTitle: string,
  seriesName: string | null,
  seriesPosition: number | null
): SeriesTitleFixture => ({
  id,
  title,
  expected: { cleanTitle, seriesName, seriesPosition },
  sourceUrl: `https://www.goodreads.com/book/show/${bookId}`,
  sourceNote: `Goodreads record ${bookId} page title (og:title) is exactly ${JSON.stringify(title)}, checked 2026-10-17.`,
});

/**
 * Titles as the Goodreads source returns them (series sits in a trailing
 * parenthetical). Each row cites its Goodreads book id; the record page title
 * (og:title, which Goodreads truncates to 50 characters) matches the string. Google Books, Hardcover, and TMDB are not represented: Google
 * Books answered 429 without a key and the other two need credentials. TMDB
 * titles never reach this parser (lookup-book only parses book results).
 */
export const goodreadsTitleCorpus: readonly SeriesTitleFixture[] = [
  gr('gr-holes-series-book', 'Holes (Holes Series Book 1)', '50000443', 'Holes', 'Holes Series', 1),
  gr(
    'gr-dopamine-detox-long-subtitle',
    'Dopamine Detox : A Short Guide to Remove Distractions and Train Your Brain to Do Hard Things (Productivity Series Book 1)',
    '58503121',
    'Dopamine Detox : A Short Guide to Remove Distractions and Train Your Brain to Do Hard Things',
    'Productivity Series',
    1
  ),
  gr(
    'gr-case-of-the-hobbit-heist',
    'Case of the Hobbit Heist (Corgi Case Files Book 19)',
    '204420093',
    'Case of the Hobbit Heist',
    'Corgi Case Files',
    19
  ),
  gr(
    'gr-the-plot-comma-hash',
    'The Plot (The Book Series, #1)',
    '55315487',
    'The Plot',
    'The Book Series',
    1
  ),
  gr(
    'gr-bad-beginning-comma-hash',
    'The Bad Beginning (A Series of Unfortunate Events, #1)',
    '78411',
    'The Bad Beginning',
    'A Series of Unfortunate Events',
    1
  ),
  gr(
    'gr-beatrice-letters-decimal',
    'The Beatrice Letters (A Series of Unfortunate Events, #12.5)',
    '74720',
    'The Beatrice Letters',
    'A Series of Unfortunate Events',
    12.5
  ),
  gr(
    'gr-wrinkle-in-time',
    'A Wrinkle in Time (Time Series, #1)',
    '895953',
    'A Wrinkle in Time',
    'Time Series',
    1
  ),
  gr(
    'gr-hammer-time-series-hash',
    'Hammer Time (Chequered Flag Series #1)',
    '200803945',
    'Hammer Time',
    'Chequered Flag Series',
    1
  ),
  gr(
    'gr-harry-potter-comma-book',
    "Harry Potter and the Sorcerer's Stone (Harry Potter, Book 1)",
    '258070452',
    "Harry Potter and the Sorcerer's Stone",
    'Harry Potter',
    1
  ),
  gr(
    'gr-hobbit-graphic-novel-book-3',
    'The Hobbit: or There and Back Again (Graphic Novel, Book 3)',
    '74378',
    'The Hobbit: or There and Back Again',
    'Graphic Novel',
    3
  ),
  gr(
    'gr-by-sin-i-rise-part-one',
    'By Sin I Rise: Part One (Sins of the Fathers, #1)',
    '57605673',
    'By Sin I Rise: Part One',
    'Sins of the Fathers',
    1
  ),
  gr(
    'gr-korra-part-one',
    'The Legend of Korra: Turf Wars, Part One (The Legend of Korra: Turf Wars, #1)',
    '33161035',
    'The Legend of Korra: Turf Wars, Part One',
    'The Legend of Korra: Turf Wars',
    1
  ),
  gr(
    'gr-part-of-your-world',
    'Part of Your World (Part of Your World, #1)',
    '58684524',
    'Part of Your World',
    'Part of Your World',
    1
  ),
  gr(
    'gr-fourth-wing-dramatized',
    'Fourth Wing (Part 1 of 2) [Dramatized Adaptation] (The Empyrean, #1)',
    '199149897',
    'Fourth Wing (Part 1 of 2) [Dramatized Adaptation]',
    'The Empyrean',
    1
  ),
  gr(
    'gr-court-mist-fury-dramatized',
    'A Court of Mist and Fury (Part 1 of 2) [Dramatized Adaptation] (A Court of Thorns and Roses, #2)',
    '61029196',
    'A Court of Mist and Fury (Part 1 of 2) [Dramatized Adaptation]',
    'A Court of Thorns and Roses',
    2
  ),
  gr(
    'gr-sorcerers-stone-audio-bundle',
    "Harry Potter and the Sorcerer's Stone (Book 1) [AUDIOBOOK] [UNABRIDGED] (Audio CD) + free Harry Potter t-shirt (Harry Potter, Book 1)",
    '132248439',
    "Harry Potter and the Sorcerer's Stone (Book 1) [AUDIOBOOK] [UNABRIDGED] (Audio CD) + free Harry Potter t-shirt",
    'Harry Potter',
    1
  ),
  gr(
    'gr-my-time-again-dash-in-series-name',
    'My Time Again: A Time Travel Novel (My Time Again - A Series of Time Travel Novels Book 1)',
    '123264903',
    'My Time Again: A Time Travel Novel',
    'My Time Again - A Series of Time Travel Novels',
    1
  ),
  gr(
    'gr-way-of-kings-part-of-two',
    'The Way of Kings, Part 1 (The Stormlight Archive, #1, Part 1 of 2)',
    '9329354',
    'The Way of Kings, Part 1 (The Stormlight Archive, #1, Part 1 of 2)',
    null,
    null
  ),
  gr(
    'gr-dance-with-dragons-part-of-two',
    'A Dance with Dragons 1: Dreams and Dust (A Song of Ice and Fire, #5, Part 1 of 2)',
    '13337715',
    'A Dance with Dragons 1: Dreams and Dust (A Song of Ice and Fire, #5, Part 1 of 2)',
    null,
    null
  ),
  gr(
    'gr-complete-wreck-range',
    'The Complete Wreck (A Series of Unfortunate Events, #1-13)',
    '65113',
    'The Complete Wreck (A Series of Unfortunate Events, #1-13)',
    null,
    null
  ),
  gr(
    'gr-harry-potter-boxed-range',
    'Harry Potter Boxed Set, Books 1-5 (Harry Potter, #1-5)',
    '8',
    'Harry Potter Boxed Set, Books 1-5 (Harry Potter, #1-5)',
    null,
    null
  ),
  gr(
    'gr-twig-needs-time-suffix-letter',
    'Twig Needs Time (Considerate Critters Series, #1a)',
    '211168817',
    'Twig Needs Time (Considerate Critters Series, #1a)',
    null,
    null
  ),
  gr(
    'gr-beyond-trailing-audiobook',
    'Beyond (Afterlife Book 1) - Audiobook',
    '246402912',
    'Beyond (Afterlife Book 1) - Audiobook',
    null,
    null
  ),
  gr(
    'gr-not-like-her-dash-audiobook',
    'Not Like Her - Selena Bailey Book 1 - Audiobook',
    '260391169',
    'Not Like Her - Selena Bailey Book 1 - Audiobook',
    null,
    null
  ),
  gr(
    'gr-oregon-promise-dash-audiobook',
    'Through Dust and Ashes - Oregon Promise, Book 1 - Audiobook',
    '260549455',
    'Through Dust and Ashes - Oregon Promise, Book 1 - Audiobook',
    null,
    null
  ),
  gr(
    'gr-dunmara-colon-series-dash-book',
    'If Walls Could Talk: The Dunmara Series - Book 1',
    '244436613',
    'If Walls Could Talk: The Dunmara Series - Book 1',
    null,
    null
  ),
  gr(
    'gr-hobbit-book-one-of-three',
    'The Hobbit, Book One of Three',
    '134917064',
    'The Hobbit, Book One of Three',
    null,
    null
  ),
  gr(
    'gr-hobbit-comma-or',
    'The Hobbit, or There and Back Again',
    '5907',
    'The Hobbit, or There and Back Again',
    null,
    null
  ),
  gr(
    'gr-hobbit-semicolon-or',
    'The Hobbit; or, There and Back Again.',
    '242180500',
    'The Hobbit; or, There and Back Again.',
    null,
    null
  ),
  gr(
    'gr-korean-harry-potter',
    '해리 포터와 마법사의 돌 1 (Harry Potter #1, part 1 of 2)',
    '49812',
    '해리 포터와 마법사의 돌 1 (Harry Potter #1, part 1 of 2)',
    null,
    null
  ),
];

/**
 * Synthetic strings are kept separate from the attributed corpus. They pin
 * parser syntax and the prior regressions without claiming that the exact
 * assembled string is a catalog title.
 */
export const syntheticSeriesTitleFixtures: readonly SeriesTitleFixture[] = [
  {
    id: 'prior-hobbit-dash-regression',
    title: 'The Hobbit - Or There and Back Again Book 1',
    expected: {
      cleanTitle: 'The Hobbit - Or There and Back Again Book 1',
      seriesName: null,
      seriesPosition: null,
    },
    sourceUrl: 'synthetic://series-title-parser',
    sourceNote:
      'Synthetic regression string based on the attributed Hobbit title; exact string is not a catalog title.',
  },
  {
    id: 'explicit-dash-series-syntax',
    title: 'Book Name - Series Book 1',
    expected: {
      cleanTitle: 'Book Name - Series Book 1',
      seriesName: null,
      seriesPosition: null,
    },
    sourceUrl: 'synthetic://series-title-parser',
    sourceNote:
      'Synthetic format candidate; a series name that is only "Series" or "The Series" names no series, so the title stays whole.',
  },
  {
    id: 'explicit-dash-named-series-syntax',
    title: 'Book Name - The Series Book 1',
    expected: {
      cleanTitle: 'Book Name - The Series Book 1',
      seriesName: null,
      seriesPosition: null,
    },
    sourceUrl: 'synthetic://series-title-parser',
    sourceNote:
      'Synthetic format candidate; a series name that is only "Series" or "The Series" names no series, so the title stays whole.',
  },
  {
    id: 'explicit-comma-part-series-syntax',
    title: 'Book Name, Part 1 of Series',
    expected: {
      cleanTitle: 'Book Name, Part 1 of Series',
      seriesName: null,
      seriesPosition: null,
    },
    sourceUrl: 'synthetic://series-title-parser',
    sourceNote:
      'Synthetic format candidate; a series name that is only "Series" or "The Series" names no series, so the title stays whole.',
  },
  {
    id: 'series-of-subtitle-dash-regression',
    title: 'Letters - A Series of Letters Book 2',
    expected: {
      cleanTitle: 'Letters - A Series of Letters Book 2',
      seriesName: null,
      seriesPosition: null,
    },
    sourceUrl: 'synthetic://series-title-parser',
    sourceNote:
      'Synthetic real-shaped dash subtitle; the Series keyword is not sufficient when followed by "of".',
  },
  {
    id: 'standalone-part-series-regression',
    title: 'Part 1 of Series',
    expected: {
      cleanTitle: 'Part 1 of Series',
      seriesName: null,
      seriesPosition: null,
    },
    sourceUrl: 'synthetic://series-title-parser',
    sourceNote: 'Synthetic prior regression; no title delimiter means the input remains untouched.',
  },
  {
    id: 'numeric-only-part-series-regression',
    title: 'Book Name, Part 1 of 2',
    expected: {
      cleanTitle: 'Book Name, Part 1 of 2',
      seriesName: null,
      seriesPosition: null,
    },
    sourceUrl: 'synthetic://series-title-parser',
    sourceNote:
      'Synthetic numeric-only regression; the final number is a format count, not a series name.',
  },
  {
    id: 'numeric-parts-suffix-regression',
    title: 'Book Name, Part 1 of 2 Parts',
    expected: {
      cleanTitle: 'Book Name, Part 1 of 2 Parts',
      seriesName: null,
      seriesPosition: null,
    },
    sourceUrl: 'synthetic://series-title-parser',
    sourceNote: 'Synthetic format-count regression; an N Parts suffix is not a series name.',
  },
  {
    id: 'number-word-part-suffix-regression',
    title: 'Book Name, Part 1 of Two',
    expected: {
      cleanTitle: 'Book Name, Part 1 of Two',
      seriesName: null,
      seriesPosition: null,
    },
    sourceUrl: 'synthetic://series-title-parser',
    sourceNote: 'Synthetic format-count regression; a number word is not a series name.',
  },
  {
    id: 'compound-number-word-part-suffix-regression',
    title: 'Book Name, Part 1 of Twenty-One',
    expected: {
      cleanTitle: 'Book Name, Part 1 of Twenty-One',
      seriesName: null,
      seriesPosition: null,
    },
    sourceUrl: 'synthetic://series-title-parser',
    sourceNote: 'Synthetic format-count regression; a compound number word is not a series name.',
  },
  {
    id: 'number-word-parts-suffix-regression',
    title: 'Book Name, Part 1 of One Hundred and Two Parts',
    expected: {
      cleanTitle: 'Book Name, Part 1 of One Hundred and Two Parts',
      seriesName: null,
      seriesPosition: null,
    },
    sourceUrl: 'synthetic://series-title-parser',
    sourceNote:
      'Synthetic format-count regression; a compound number word with Parts is not a series name.',
  },
  {
    id: 'parenthetical-format-precedence-regression',
    title: 'Book Name, Part 1 of Something (Canonical #2)',
    expected: {
      cleanTitle: 'Book Name, Part 1 of Something',
      seriesName: 'Canonical',
      seriesPosition: 2,
    },
    sourceUrl: 'synthetic://series-title-parser',
    sourceNote:
      'Synthetic overlap regression; the established parenthetical series format takes precedence.',
  },
  {
    id: 'curse-part-series-syntax',
    title: 'Curse: Part 1 of the Battle of Fansareah Series',
    expected: {
      cleanTitle: 'Curse',
      seriesName: 'Battle of Fansareah Series',
      seriesPosition: 1,
    },
    sourceUrl: 'synthetic://series-title-parser',
    sourceNote:
      'Synthetic string, not a catalog title (the record is just "Curse"); pins the Part N of Series format.',
  },
  {
    id: 'generic-time-series-dash-tradeoff',
    title: 'Statistics - Time Series Book 2',
    expected: {
      cleanTitle: 'Statistics',
      seriesName: 'Time Series',
      seriesPosition: 2,
    },
    sourceUrl: 'synthetic://series-title-parser',
    sourceNote:
      'Accepted trade-off. No catalog record has this shape; every real "X - Y Series Book N" title found (20 in Open Library) is a branded series. A generic "Y Series" cannot be told apart by syntax.',
  },
];

/**
 * Every adversarial string from the two review passes remains a title. These
 * are synthetic parser cases, not claims about catalog records.
 */
export const reviewRegressionTitles: readonly string[] = [
  'Letters - A Series of Letters Book 2',
  'A Tale - A Series of Unfortunate Events Book 1',
  'Foo - Series Book 1 Book 2',
  'Foo: Part 1 of 2 - Series Book 3',
  'Foo, Part 1 of 2 Parts',
  'Foo, Part 1 of Two',
  'Foo, Part 1 of Series (Unabridged)',
  'Letters - A Series of Unfortunate Events Book 2',
  'Book Name, Part 1 of 3 Volumes',
  'Book Name, Part 1 of 2 CDs',
  'Book Name, Part 1 of 2 Discs',
  'Book Name, Part 1 of 4 Cassettes',
  'Book Name, Part 1 of 2 Audiobooks',
  'Book Name, Part 1 of 2 Books',
  'Book Name, Part 1 of Three Volumes',
  'Book Name, Part 1 of II',
  'Book Name, Part 1 of 2 (Unabridged)',
  'Book Name: Part 1 of 2, Unabridged',
  'Book Name, Part 1 of 2 Parts.',
  'Foo - A Novel in a Series Book 2',
  'Foo - Series Book 1',
  'Foo - Seriesly Book 1',
  'Foo -Series Book 1',
  'Foo - Series Overview Book 1',
  'Book Name, Part 1 of Twenty-One',
  'Book Name, Part 1 of Two Parts',
  'Book Name, Part 1 of One Hundred and Two Parts',
  'Book Name, Part 1 of two',
  'Book Name, Part 1 of 2 parts',
  'Part 1 of And',
  // These formerly misattributed strings are retained only as synthetic
  // parser regressions.
  'The Autobiography Of Henry VIII: Part 1 of 2',
  'Spandau: The Secret Diaries Part 1 of 2',
  'Patton: Ordeal and Triumph Part 1 of 2',
  'George Orwell: A Life Part 1 of 2',
  'The Hobbit: or There and Back Again',
];
