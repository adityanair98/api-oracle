## Summary
<!-- What does this PR do? -->

## Checklist
- [ ] `npm run build` passes
- [ ] `npm test` passes (160 tests)
- [ ] `npm run validate` passes
- [ ] `npm run lint-entries` passes (0 errors)

## If adding a new API entry
- [ ] Entry follows the schema in `src/knowledge/schema.ts`
- [ ] All required fields are filled with real (not guessed) data
- [ ] Code examples are copy-pasteable and correct
- [ ] `lastVerified` is set to today's date
- [ ] Cross-references (`alternatives`, `complementary`) use valid slugs
