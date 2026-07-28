<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useSkillsStore } from '@/stores/skills'
import SkillDetailPanel from '@/routes/skills/components/skill-detail-panel/index.vue'
import SkillListPanel from '@/routes/skills/components/skill-list-panel/index.vue'

defineOptions({ name: 'SkillsPage' })

const { loadSkills } = useSkillsStore()
const mobilePane = ref<'list' | 'detail'>('list')
const mobilePaneOptions = [
  { value: 'list', label: '技能列表' },
  { value: 'detail', label: '技能详情' },
]

onMounted(() => {
  void loadSkills()
})

function onSkillSelected() {
  mobilePane.value = 'detail'
}
</script>

<template>
  <main :class="$style.page">
    <div :class="$style.mobileSwitch">
      <UTabs
        v-model="mobilePane"
        :items="mobilePaneOptions"
        :content="false"
        :ui="{ list: 'w-full', trigger: 'grow' }"
      />
    </div>
    <div :class="$style.layout">
      <SkillListPanel
        :class="{ [$style.mobileHidden]: mobilePane === 'detail' }"
        @selected="onSkillSelected"
      />
      <SkillDetailPanel :class="{ [$style.mobileHidden]: mobilePane === 'list' }" />
    </div>
  </main>
</template>

<style module src="./index.module.css"></style>
