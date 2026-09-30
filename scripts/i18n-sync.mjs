import fs from 'node:fs/promises'
for (const file of await fs.readdir('i18n/locales')) {
  if (!file.endsWith('.json')) continue
  const path = `i18n/locales/${file}`
  const json = JSON.parse(await fs.readFile(path, 'utf8'))
  const sorted = Object.fromEntries(Object.entries(json).sort(([a], [b]) => a.localeCompare(b, 'en')))
  const text = JSON.stringify(sorted, null, '\t') + '\n'
  if (text !== (await fs.readFile(path, 'utf8'))) await fs.writeFile(path, text)
}
console.log('Locale JSON validated and keys normalized.')
