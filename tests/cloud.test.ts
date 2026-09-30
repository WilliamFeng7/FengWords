import test from 'node:test'
import assert from 'node:assert/strict'
import 'fake-indexeddb/auto'
import { isRecordType, parseRecoveryCode, validCloudRow } from '../shared/cloud'
import { getDb, recordTable, readAllRows } from '../app/core/persistence/db'
import { walkState, emptyBaseline, diffState, assembleState } from '../app/core/persistence/records'

test('type allowlist and quoted/non-ASCII keys', () => {
  assert.ok(isRecordType('fw:entries:word:custom|"中文"'))
  for (const value of ['users', 'fw:secrets:test', 'fw:notes:', null, 'fw:notes:' + 'x'.repeat(1100)])
    assert.equal(isRecordType(value), false)
})
test('recovery code is a workspace plus 256-bit secret, not an arbitrary id', () => {
  const valid = 'fw1.12345678-1234-1234-1234-123456789012.' + 'a'.repeat(43)
  assert.ok(parseRecoveryCode(valid))
  assert.equal(parseRecoveryCode(valid.slice(0, -1)), null)
  assert.equal(parseRecoveryCode('12345678-1234-1234-1234-123456789012'), null)
})
test('wire rows validate timestamps, versions, payloads and tombstones', () => {
  const now = Date.now(),
    row = {
      type: 'fw:notes:hello',
      data: { v: 'note', t: now },
      data_version: 1,
      updated_at: new Date(now).toISOString(),
    }
  assert.ok(validCloudRow(row))
  assert.ok(validCloudRow({ ...row, data: { del: 1, t: now } }))
  assert.equal(validCloudRow({ ...row, data: { t: now } }), false)
  assert.equal(validCloudRow({ ...row, data: { v: 'x', t: now + 3600000 } }), false)
  assert.equal(validCloudRow({ ...row, data_version: NaN }), false)
  assert.equal(validCloudRow({ ...row, data_version: 0 }), false)
  assert.ok(
    validCloudRow({
      type: 'setting',
      data: { theme: 'dark' },
      data_version: 23,
      updated_at: new Date(now).toISOString(),
    })
  )
})
test('existing local dictionaries, statistics, FSRS and notes round-trip through per-record storage', async () => {
  const state = {
    simpleWords: ['the'],
    dictListVersion: 1,
    word: {
      studyIndex: 0,
      bookList: [
        {
          id: 'custom',
          custom: true,
          name: 'Personal',
          words: [
            { word: 'hello', trans: ['你好'] },
            { word: 'world', trans: ['世界'] },
          ],
          statistics: [{ startDate: 100, total: 2 }],
        },
      ],
    },
    article: { studyIndex: -1, bookList: [] },
    fsrsData: { hello: { due: 123 } },
    noteData: { hello: 'A note' },
  }
  const base = emptyBaseline(),
    change = diffState(walkState(state), base, { deep: true })
  const db = getDb()
  await db.transaction('rw', db.tables, async () => {
    for (const [name, puts] of Object.entries(change.puts)) {
      await recordTable(name as any).bulkPut(puts.map(p => ({ ...p, t: 1000, dirty: 1 as const })))
    }
  })
  change.commit()
  assert.equal(diffState(walkState(state), base, { deep: true }).count, 0)
  const restored = assembleState(await readAllRows(), { word: { bookList: [] }, article: { bookList: [] } }, d => d)
  const book = restored.word.bookList.find((d: any) => d.id === 'custom')
  assert.deepEqual(
    book.words.map((w: any) => w.word),
    ['hello', 'world']
  )
  assert.equal(book.statistics[0].total, 2)
  assert.equal(restored.noteData.hello, 'A note')
  assert.deepEqual(restored.fsrsData.hello, { due: 123 })
  state.word.bookList[0].words[0].trans = ['您好']
  const edit = diffState(walkState(state), base, { deep: true })
  assert.equal(edit.puts.entries.length, 1, 'Only the edited word should be written')
  db.close()
})
