<script setup lang="ts">
import SkillListPanel from '@/routes/skills/components/skill-list-panel/index.vue'

defineOptions({ name: 'SkillsPage' })
</script>

<template>
  <main :class="$style.page">
    <header :class="$style.header">
      <div :class="$style.heading">
        <div :class="[$style.kicker, 'mono']">SKILLS</div>
        <div :class="$style.titleRow">
          <h1>技能库</h1>
        </div>
        <p>上传、筛选与管理当前工作区的技能包。</p>
      </div>
    </header>

    <div :class="$style.panelWrap">
      <SkillListPanel />
    </div>
  </main>
</template>

<style module src="./index.module.css"></style>
