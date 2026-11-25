<script setup lang="ts">
import { useCssModule } from 'vue'

defineOptions({ name: 'ListCard' })

const styles = useCssModule()

withDefaults(
  defineProps<{
    /** 标题（如「群组列表」）。 */
    title: string
    /** 总数；有则在标题下渲染「共 N 条」。仅无分页栏的页面传，有分页栏时总数只由分页栏显示。 */
    total?: number
  }>(),
  { total: undefined },
)
</script>

<template>
  <UCard as="section" :ui="{ root: styles.listCard, header: styles.head, body: styles.body, footer: styles.footer }">
    <template #header>
      <div :class="styles.heading">
        <h3 :class="styles.title">{{ title }}</h3>
        <p v-if="total != null" :class="['mono', styles.total]">共 {{ total }} 条</p>
      </div>
      <div v-if="$slots.toolbar || $slots.tools" :class="styles.toolbar">
        <slot name="toolbar" />
        <template v-if="$slots.tools">
          <span :class="styles.divider" />
          <slot name="tools" />
        </template>
      </div>
    </template>

    <slot />

    <template v-if="$slots.footer" #footer>
      <slot name="footer" />
    </template>
  </UCard>
</template>

<style module src="./index.module.css"></style>
