<script setup lang="ts">
import { computed } from 'vue'
import { parseDate, type CalendarDate } from '@internationalized/date'
import type { DateRange } from 'reka-ui'

defineOptions({ name: 'DateRangeInput' })

/** 与列表筛选状态一致：['YYYY-MM-DD', 'YYYY-MM-DD']，空数组或空串表示不限。 */
const model = defineModel<string[]>({ required: true })

function toDate(value: string | undefined): CalendarDate | undefined {
  if (!value) return undefined
  try {
    return parseDate(value)
  } catch {
    return undefined
  }
}

const range = computed<DateRange>({
  get: () => ({ start: toDate(model.value[0]), end: toDate(model.value[1]) }),
  set: (value) => { model.value = [value?.start?.toString() ?? '', value?.end?.toString() ?? ''] },
})
</script>

<template>
  <UInputDate v-model="range" range class="w-full">
    <template #trailing>
      <UPopover :content="{ align: 'end' }">
        <UButton color="neutral" variant="link" size="sm" icon="i-lucide-calendar" aria-label="选择日期范围" class="px-0" />
        <template #content>
          <UCalendar v-model="range" range :number-of-months="2" class="p-2" />
        </template>
      </UPopover>
    </template>
  </UInputDate>
</template>
