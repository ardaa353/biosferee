# Turkish and English

The primary device language selects Turkish for `tr` / `tr-*`, and English otherwise. A saved account choice overrides device detection. Users change it under Settings → Language. Logging out returns to device detection. Account preferences are stored in `user_preferences`; there are no changes to existing user/post columns. Tables are created automatically with `CREATE TABLE IF NOT EXISTS` on first use.

UI translations are reviewed static strings in `src/lib/messages.en.json`. They do not call any translation service. `src/lib/i18n.ts` handles locale selection, account persistence in the browser, dynamic messages and placeholders. All dates and numeric summaries follow the selected locale. Scientific taxonomy, usernames, original observations and export archives are preserved.

Observation descriptions, identification notes, public profile biographies (for authenticated viewers), and moderation reports (for moderators/admins only) use `biosfere.translations.get`. Only stored, accessible records can be translated: the endpoint does not accept arbitrary text. Translation is requested when the content approaches the viewport. Source text is always retained and users can switch between the translation and original. Editing a record changes the translation key. Provider failures and limits show the original with an explicit notice and retry control. Render's startup service worker never caches these APIs.

## Free default provider and its limits

MyMemory is the default provider, without an API key or paid subscription. Its anonymous allowance is currently **5,000 characters per day**, shared by this server's outbound IP. It is not an unlimited service. Only exact-source translation-memory matches or machine translations of the exact source are accepted; fuzzy matches to different sentences are rejected. ISO 639-1 language pairs are preferred to keep machine translation available. UTF-8 requests are split below the provider's 500-byte maximum. Original paragraphs are preserved.

Successful translations are cached by source-text hash and target language, both in memory and persistently in `text_translations`, so repeated readers do not spend the allowance again. Duplicate requests are combined and outbound concurrency is limited. A quota response activates a cooldown. No email, credentials, photo metadata or other account details are sent to the provider. Only the text being translated is sent. Machine translation remains imperfect; the original is always available.

Official references: https://mymemory.translated.net/doc/spec.php and https://mymemory.translated.net/doc/usagelimits.php

## Optional self-hosted provider

Set `LIBRETRANSLATE_URL` to the base URL of your own LibreTranslate instance. If the instance requires a key, set `LIBRETRANSLATE_API_KEY`. These remain server-side variables. The default MyMemory provider is then replaced by that instance. LibreTranslate supports automatic source detection. Hosting and capacity are the operator's responsibility; an unconfigured or unavailable instance does not make the public LibreTranslate service free or unlimited.

English species common names come from iNaturalist taxon profiles, with a language-specific cache. If none exists, the scientific name is displayed rather than inventing a translated species name. Original common names remain in the database and editing forms.
