<script setup lang="ts">
import { useCssModule } from 'vue'

defineOptions({ name: 'ListCard' })

const styles = useCssModule()

withDefaults(
  defineProps<{
    /** 标题（如「群组列表」）。 */
    title: string
    /** 说明文案。 */
    description?: string
    /** 总数；有则在说明后渲染「共 N 条」。 */
    total?: number
  }>(),
  { description: '', total: undefined },
)
</script>

<template>
  <section :class="styles.listCard">
    <header :class="styles.head">
      <div :class="styles.heading">
        <h3 :class="styles.title">{{ title }}</h3>
        <p v-if="description || total != null" :class="styles.description">
          <span v-if="description">{{ description }}</span>
          <span v-if="total != null" :class="['mono', styles.total]">共 {{ total }} 条</span>
        </p>
      </div>
      <div v-if="$slots.toolbar || $slots.tools" :class="styles.toolbar">
        <slot name="toolbar" />
        <template v-if="$slots.tools">
          <span :class="styles.divider" />
          <slot name="tools" />
        </template>
      </div>
    </header>

    <div :class="styles.body">
      <slot />
    </div>

    <footer v-if="$slots.footer" :class="styles.footer">
      <slot name="footer" />
    </footer>
  </section>
</template>

<style module src="./index.module.css"></style>
