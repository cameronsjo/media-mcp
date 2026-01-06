#!/usr/bin/env tsx

/**
 * Script to enrich books in the Books Queue with metadata from Goodreads, Google Books, and Open Library
 * This script reads the Books Queue markdown file, looks up each book, and updates it with enriched metadata
 */

import * as fs from 'fs';
import * as path from 'path';

interface BookEntry {
  title: string;
  author?: string;
  originalLine: string;
  lineNumber: number;
  category: string;
  existingTags: string[];
  existingDescription: string;
}

interface EnrichedBook {
  title: string;
  author?: string;
  description?: string;
  genres: string[];
  tropes: string[];
  shelves: string[];
  rating?: number;
  series?: string;
  seriesPosition?: number;
}

/**
 * Parse the Books Queue markdown file
 */
function parseBooksQueue(filePath: string): BookEntry[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const books: BookEntry[] = [];
  let currentCategory = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Track current category
    if (line.startsWith('## ')) {
      currentCategory = line.replace('##', '').trim();
      continue;
    }

    // Parse book entries
    const bookMatch = line.match(/^- \*\*(.*?)\*\*/);
    if (bookMatch) {
      const fullTitle = bookMatch[1];
      let title = fullTitle;
      let author: string | undefined;

      // Try to extract author from "Title by Author" format
      const byMatch = fullTitle.match(/^(.+?)\s+by\s+(.+)$/i);
      if (byMatch) {
        title = byMatch[1].trim();
        author = byMatch[2].trim();
      }

      // Extract existing description and tags
      let existingDescription = '';
      let existingTags: string[] = [];

      // Look for description in the next line
      if (i + 1 < lines.length && lines[i + 1].trim().startsWith('- ')) {
        existingDescription = lines[i + 1].trim().replace(/^- /, '');

        // Extract tags from description
        const tagMatches = existingDescription.match(/#[\w-]+/g);
        if (tagMatches) {
          existingTags = tagMatches.map(t => t.substring(1)); // Remove #
        }
      }

      books.push({
        title,
        author,
        originalLine: line,
        lineNumber: i,
        category: currentCategory,
        existingTags,
        existingDescription,
      });
    }
  }

  return books;
}

/**
 * Mock enrichment function - in production, this would call the media-mcp server
 * For now, we'll use a simpler approach with direct API calls
 */
async function enrichBook(book: BookEntry): Promise<EnrichedBook | null> {
  console.log(`Looking up: "${book.title}"${book.author ? ` by ${book.author}` : ''}`);

  // TODO: Call the actual lookup_book tool from media-mcp
  // For now, return the existing data
  return {
    title: book.title,
    author: book.author,
    description: book.existingDescription,
    genres: [],
    tropes: book.existingTags.filter(tag =>
      // Keep existing trope-like tags
      ['enemies-to-lovers', 'friends-to-lovers', 'forced-proximity', 'dark-romance',
       'slow-burn', 'age-gap', 'fake-marriage', 'grumpy-sunshine', 'second-chance',
       'fated-mates', 'alpha-male', 'small-town', 'workplace-romance'].includes(tag.toLowerCase())
    ),
    shelves: [],
    rating: undefined,
    series: undefined,
  };
}

/**
 * Format enriched book data as markdown
 */
function formatBookEntry(book: BookEntry, enriched: EnrichedBook): string {
  const titlePart = enriched.author
    ? `**${enriched.title} by ${enriched.author}**`
    : `**${enriched.title}**`;

  let result = `- ${titlePart}\n`;

  if (enriched.description) {
    result += `  - ${enriched.description}`;
  }

  // Add tags
  const allTags = new Set<string>();

  // Add genres as tags
  enriched.genres.forEach(g => allTags.add(g.toLowerCase().replace(/\s+/g, '-')));

  // Add tropes as tags
  enriched.tropes.forEach(t => allTags.add(t.toLowerCase().replace(/\s+/g, '-')));

  // Add category-specific tags
  if (book.category.toLowerCase().includes('romance')) {
    allTags.add('romance');
  }
  if (book.category.toLowerCase().includes('fantasy')) {
    allTags.add('fantasy');
  }

  if (allTags.size > 0) {
    const tagsStr = Array.from(allTags).map(t => `#${t}`).join(' ');
    if (enriched.description) {
      result += ` ${tagsStr}`;
    } else {
      result += `  - ${tagsStr}`;
    }
  }

  result += '\n';

  return result;
}

/**
 * Main function
 */
async function main() {
  const queuePath = path.join(
    process.env.HOME || '~',
    'Documents/The Compendium/Media/Resources/Books Queue.md'
  );

  console.log(`Reading Books Queue from: ${queuePath}`);

  const books = parseBooksQueue(queuePath);
  console.log(`Found ${books.length} books to enrich`);

  // For now, just show what we found
  books.slice(0, 5).forEach(book => {
    console.log(`\nBook: ${book.title}`);
    console.log(`  Author: ${book.author || 'Not specified'}`);
    console.log(`  Category: ${book.category}`);
    console.log(`  Existing tags: ${book.existingTags.join(', ') || 'None'}`);
  });

  console.log(`\n\nNote: Full enrichment requires the media-mcp server to be running.`);
  console.log(`Once the Node compatibility issue is resolved, this script will:`);
  console.log(`  1. Look up each book on Goodreads, Google Books, and Open Library`);
  console.log(`  2. Extract descriptions, genres, and tropes`);
  console.log(`  3. Update the Books Queue file with enriched metadata`);
}

main().catch(console.error);
