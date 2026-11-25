# Cat origin notes

The cat selection footer shows the selected cat's country/region flag and a brief Korean origin note. It replaces the old selection sentence in the same location below the scrolling grid. Changing a category does not discard the selected cat or its note.

`lib/companion-origins.mjs` holds Korean and English copy together, with source URLs on each record. `getCompanionOrigin(catId, 'en')` provides the prepared English copy; this change does not add a language switch. Records are keyed by the existing MEOW catalog IDs. Coat-length variants resolve to their existing parent group, and the original MEOW portraits are unchanged.

Country flags identify a documented historical origin or location of breed development. They do not indicate an individual cat's nationality. Historical roots and modern breed development are distinguished where they differ; disputed origins and legends are not presented as proven facts. Household coat/color categories use 🌍 because they have no single national origin and are not separate pedigree breeds.

Research date: 2026-11-26. References are stored beside each record to keep the bilingual descriptions reviewable. Principal sources are official cat registries and breed clubs. English and Korean descriptions are original short summaries, not copied source text.

MBTI options and the saved profile summary also display familiar type nicknames from `lib/mbti-labels.mjs`, using the [16Personalities naming reference](https://www.16personalities.com/ko/성격-유형). These are display labels only; the existing four-letter values and shared profile storage remain unchanged. Korean and English labels are prepared together.

After profile completion, the player header's account button shows the saved MEOW cat portrait with the MBTI code in small text below it. It retains its account-dialog action, identifies the cat and full MBTI nickname accessibly, and clears when signed out. Both music player pages use the same account component.
