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
      cleanTitle: 'The Jacq of Spades',
      seriesName: 'the Red Dog Conspiracy',
      seriesPosition: 1,
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
      seriesName: 'the Covenants in the Biblical Evolution Revolution Series',
      seriesPosition: 1,
    },
    sourceUrl: 'https://openlibrary.org/books/OL32531681M.json',
    sourceNote:
      'Open Library title field is exactly "The Covenant of Abraham, Isaac, and Jacob, Part 1 of the Covenants in the Biblical Evolution Revolution Series".',
  },
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
      cleanTitle: 'Book Name',
      seriesName: 'Series',
      seriesPosition: 1,
    },
    sourceUrl: 'synthetic://series-title-parser',
    sourceNote: 'Synthetic syntax contract; not a real title.',
  },
  {
    id: 'explicit-dash-named-series-syntax',
    title: 'Book Name - The Series Book 1',
    expected: {
      cleanTitle: 'Book Name',
      seriesName: 'The Series',
      seriesPosition: 1,
    },
    sourceUrl: 'synthetic://series-title-parser',
    sourceNote: 'Synthetic syntax contract; not a real title.',
  },
  {
    id: 'explicit-comma-part-series-syntax',
    title: 'Book Name, Part 1 of Series',
    expected: {
      cleanTitle: 'Book Name',
      seriesName: 'Series',
      seriesPosition: 1,
    },
    sourceUrl: 'synthetic://series-title-parser',
    sourceNote: 'Synthetic syntax contract; not a real title.',
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
];
