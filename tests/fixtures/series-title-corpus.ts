export interface SeriesTitleExpectation {
  cleanTitle: string;
  seriesName: string | null;
  seriesPosition: number | null;
}

export interface RealSeriesTitleFixture {
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
export const realSeriesTitleCorpus: readonly RealSeriesTitleFixture[] = [
  {
    id: 'hobbit-subtitle-or',
    title: 'The Hobbit or There and Back Again',
    expected: {
      cleanTitle: 'The Hobbit or There and Back Again',
      seriesName: null,
      seriesPosition: null,
    },
    sourceUrl: 'https://openlibrary.org/books/OL24209616M/The_Hobbit_or_There_and_Back_Again',
    sourceNote: 'Open Library records the full subtitle as the title of the edition.',
  },
  {
    id: 'hobbit-subtitle-colon',
    title: 'The Hobbit: or There and Back Again',
    expected: {
      cleanTitle: 'The Hobbit: or There and Back Again',
      seriesName: null,
      seriesPosition: null,
    },
    sourceUrl: 'https://openlibrary.org/books/OL10236414M/The_Hobbit',
    sourceNote: 'Open Library lists this colon subtitle in the edition title variants.',
  },
  {
    id: 'autobiography-henry-viii-audio-part',
    title: 'The Autobiography Of Henry VIII: Part 1 of 2',
    expected: {
      cleanTitle: 'The Autobiography Of Henry VIII: Part 1 of 2',
      seriesName: null,
      seriesPosition: null,
    },
    sourceUrl: 'https://openlibrary.org/books/OL9737168M/The_Autobiography_Of_Henry_VIII',
    sourceNote: 'Open Library records the audiobook as Part 1 of 2.',
  },
  {
    id: 'renaissance-audio-part',
    title: 'The Renaissance Part 1 of 2',
    expected: {
      cleanTitle: 'The Renaissance Part 1 of 2',
      seriesName: null,
      seriesPosition: null,
    },
    sourceUrl: 'https://openlibrary.org/books/OL12581465M/The_Renaissance_Part_1_of_2',
    sourceNote: 'Open Library records the Books On Tape edition as Part 1 of 2.',
  },
  {
    id: 'george-orwell-biography-audio-part',
    title: 'George Orwell: A Life Part 1 of 2',
    expected: {
      cleanTitle: 'George Orwell: A Life Part 1 of 2',
      seriesName: null,
      seriesPosition: null,
    },
    sourceUrl: 'https://openlibrary.org/books/OL4126721M/George_Orwell_a_life',
    sourceNote: 'Open Library lists the Books On Tape edition as Part 1 of 2.',
  },
  {
    id: 'spandau-audio-part',
    title: 'Spandau: The Secret Diaries Part 1 of 2',
    expected: {
      cleanTitle: 'Spandau: The Secret Diaries Part 1 of 2',
      seriesName: null,
      seriesPosition: null,
    },
    sourceUrl: 'https://openlibrary.org/books/OL20940534M/Spandau',
    sourceNote: 'Open Library lists the Books On Tape edition as Part 1 of 2.',
  },
  {
    id: 'patton-audio-part',
    title: 'Patton: Ordeal and Triumph Part 1 of 2',
    expected: {
      cleanTitle: 'Patton: Ordeal and Triumph Part 1 of 2',
      seriesName: null,
      seriesPosition: null,
    },
    sourceUrl: 'https://openlibrary.org/books/OL17922345M/Patton',
    sourceNote: 'Open Library lists the Books On Tape edition as Part 1 of 2.',
  },
  {
    id: 'curse-series-part',
    title: 'Curse: Part 1 of the Battle of Fansareah Series',
    expected: {
      cleanTitle: 'Curse',
      seriesName: 'the Battle of Fansareah Series',
      seriesPosition: 1,
    },
    sourceUrl: 'https://openlibrary.org/books/OL37528863M/Curse',
    sourceNote: 'Open Library records the title with an explicit series name and part number.',
  },
  {
    id: 'well-beloved-hyphenated-title',
    title: 'The well-beloved',
    expected: {
      cleanTitle: 'The well-beloved',
      seriesName: null,
      seriesPosition: null,
    },
    sourceUrl: 'https://openlibrary.org/books/OL2719292M/The_well-beloved',
    sourceNote: 'Open Library records the hyphenated title as a standalone novel.',
  },
];

/**
 * Synthetic strings are kept separate from the attributed corpus. They pin
 * parser syntax and the prior regressions without claiming that the exact
 * assembled string is a catalog title.
 */
export const syntheticSeriesTitleFixtures: readonly RealSeriesTitleFixture[] = [
  {
    id: 'prior-hobbit-dash-regression',
    title: 'The Hobbit - Or There and Back Again Book 1',
    expected: {
      cleanTitle: 'The Hobbit - Or There and Back Again Book 1',
      seriesName: null,
      seriesPosition: null,
    },
    sourceUrl: 'https://openlibrary.org/books/OL24209616M/The_Hobbit_or_There_and_Back_Again',
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
    title: 'Book Name - The Series Name Book 1',
    expected: {
      cleanTitle: 'Book Name',
      seriesName: 'The Series Name',
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
