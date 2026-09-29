import dayjs from 'dayjs'
import type { Statistics } from '@/core/types/types.ts'
import type { PracticeState } from '@/core/stores/practice.ts'

/** 某一天的学习量：学了几个词、花了多少毫秒 */
export type DayActivity = { words: number; spend: number }

const dayKey = (ms: number) => dayjs(ms).format('YYYY-MM-DD')

/**
 * 按天汇总单词学习量（年度活动热力图用）。
 *
 * 一条学习记录里的新词 / 复习数是“整组”的数量：跨天练完的一组会拆成 start → middle → end 几条记录，
 * 每条都带着同样的整组数量。这里把同一组的单词数按每天花的时间比例分到各天，避免重复计数。
 * 还没练完的那一组（练习缓存）只算时间，单词数等整组练完再计。
 */
export function buildDailyActivity(
  statisticsByBook: Statistics[][],
  unfinished?: Pick<PracticeState, 'spend' | 'startDate' | 'segments'> | null
): Map<string, DayActivity> {
  const map = new Map<string, DayActivity>()
  const add = (key: string, words: number, spend: number) => {
    const day = map.get(key) ?? { words: 0, spend: 0 }
    day.words += words
    day.spend += spend
    map.set(key, day)
  }

  const flushGroup = (group: Statistics[]) => {
    if (!group.length) return
    const words = Math.max(0, (group[0].new || 0) + (group[0].review || 0))
    const spends = group.map(r => Math.max(0, r.spend || 0))
    const totalSpend = spends.reduce((a, b) => a + b, 0)
    // 最大余数法：按时间比例分配，保证各天加起来正好等于整组单词数
    const exact = group.map((_, i) => (totalSpend ? (words * spends[i]) / totalSpend : words / group.length))
    const floors = exact.map(Math.floor)
    let rest = words - floors.reduce((a, b) => a + b, 0)
    exact
      .map((v, i) => ({ i, frac: v - floors[i] }))
      .sort((a, b) => b.frac - a.frac)
      .forEach(({ i }) => {
        if (rest > 0) {
          floors[i]++
          rest--
        }
      })
    group.forEach((r, i) => add(dayKey(r.startDate), floors[i], spends[i]))
  }

  for (const stats of statisticsByBook) {
    let group: Statistics[] = []
    for (const s of stats ?? []) {
      if (!s?.startDate) continue
      const role = s.sessionRole ?? 'single'
      if (role === 'single') {
        flushGroup(group)
        group = []
        flushGroup([s])
      } else if (role === 'start') {
        flushGroup(group)
        group = [s]
      } else {
        group.push(s)
        if (role === 'end') {
          flushGroup(group)
          group = []
        }
      }
    }
    flushGroup(group)
  }

  if (unfinished) {
    if (Array.isArray(unfinished.segments) && unfinished.segments.length) {
      for (const [start, end] of unfinished.segments) add(dayKey(start), 0, Math.max(0, end - start))
    } else if (unfinished.spend) {
      add(dayKey(unfinished.startDate), 0, unfinished.spend)
    }
  }
  return map
}
