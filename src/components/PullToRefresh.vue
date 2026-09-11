<template>
  <div
    class="uc-ptr"
    @touchstart="onTouchStart"
    @touchmove="onTouchMove"
    @touchend="onTouchEnd"
    @touchcancel="onTouchEnd"
  >
    <div class="uc-ptr-indicator" :style="{ opacity: indicatorOpacity, transform: `translateY(${offset}px)` }">
      <v-progress-circular
        :indeterminate="refreshing"
        :model-value="refreshing ? undefined : pullRatio * 100"
        size="26"
        width="3"
        color="primary"
      />
    </div>
    <div class="uc-ptr-content" :style="{ transform: `translateY(${offset}px)` }">
      <slot />
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'

const props = defineProps({
  refreshing: { type: Boolean, default: false }
})
const emit = defineEmits(['refresh'])

const THRESHOLD = 60
const MAX_PULL = 80

const armed = ref(false)
const startY = ref(0)
const offset = ref(0)
const triggered = ref(false)

const pullRatio = computed(() => Math.min(offset.value / THRESHOLD, 1))
const indicatorOpacity = computed(() => {
  if (triggered.value && props.refreshing) return 1
  return Math.min(offset.value / 30, 1)
})

function onTouchStart(e) {
  if (window.scrollY > 0) { armed.value = false; return }
  armed.value = true
  startY.value = e.touches[0].clientY
  triggered.value = false
}

function onTouchMove(e) {
  if (!armed.value) return
  const delta = e.touches[0].clientY - startY.value
  if (delta <= 0) { offset.value = 0; return }
  e.preventDefault()
  offset.value = Math.min(delta, MAX_PULL)
}

function onTouchEnd() {
  if (!armed.value) return
  armed.value = false
  if (offset.value >= THRESHOLD && !props.refreshing) {
    triggered.value = true
    emit('refresh')
  } else {
    offset.value = 0
  }
}

// Quando il genitore segnala che il caricamento è finito, richiudiamo
// l'indicatore (se lo avevamo aperto noi con un pull effettivo).
watch(() => props.refreshing, (isRefreshing) => {
  if (!isRefreshing && triggered.value) {
    offset.value = 0
    triggered.value = false
  }
})
</script>

<style scoped>
.uc-ptr {
  position: relative;
}

.uc-ptr-indicator {
  position: absolute;
  top: -36px;
  left: 0;
  right: 0;
  display: flex;
  justify-content: center;
  pointer-events: none;
}

.uc-ptr-content {
  transition: transform 0.15s ease-out;
}
</style>
