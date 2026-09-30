<script setup lang="ts">
import { computed, ref } from 'vue'
import { get, set } from 'idb-keyval'
import saveAs from 'file-saver'
import { Cloud, cloudRequest, cloudState } from '@/core/utils/cloud'
import { syncAllCloud } from '@/core/composables/useInit'
import { useDataSyncPersistence, saveHashSnapshot } from '@/core/composables/useDataSyncPersistence'
import { drainRecordSync } from '@/core/persistence/record-sync'
import { flushSave } from '@/core/persistence/store-persistence'
import { setMeta } from '@/core/persistence/db'
import { flushSettings } from '@/core/persistence/settings-persistence'
import { useExport } from '@/core/hooks/export'
import { parseRecoveryCode } from '#shared/cloud'
import { Toast } from '@/base'

const { t } = useI18n()
const code = ref('')
const restoreCode = ref('')
const busy = ref(false)
const confirmed = ref(false)
const error = ref('')
const { buildExportZip, getExportedData } = useExport()
const persistence = useDataSyncPersistence()
const statusLabel = computed(() =>
  cloudState.status === 'success'
    ? t('cloud_saved')
    : cloudState.status === 'syncing'
      ? t('sync_status_syncing')
      : cloudState.status === 'error'
        ? t('sync_status_failed')
        : t('cloud_waiting')
)
const errorLabel = computed(() => {
  const key = error.value || cloudState.errorCode
  if (key === 'cloud_local_audio') return t('custom_audio_sync_disabled')
  if (key === 'cloud_invalid_code') return t('cloud_code_invalid')
  if (key === 'cloud_not_configured') return t('cloud_not_configured_desc')
  if (key === 'cloud_empty') return t('cloud_empty_desc')
  if (key === 'cloud_payload_too_large') return t('cloud_payload_desc')
  return key ? t('cloud_error_desc') : ''
})

async function retry() {
  busy.value = true
  error.value = ''
  try {
    await syncAllCloud()
  } finally {
    busy.value = false
  }
}

async function copyCode() {
  busy.value = true
  try {
    const result = await cloudRequest<{ code: string }>('recovery', { method: 'POST', body: {} })
    code.value = result.code
    await navigator.clipboard.writeText(result.code)
    Toast.success(t('copy_success'))
  } catch {
    error.value = 'cloud_unavailable'
  } finally {
    busy.value = false
  }
}

async function restore() {
  if (busy.value || !confirmed.value) return
  if (!parseRecoveryCode(restoreCode.value)) {
    error.value = 'cloud_invalid_code'
    return
  }
  busy.value = true
  error.value = ''
  let oldCode = ''
  let backup: Awaited<ReturnType<typeof getExportedData>> | null = null
  let switched = false
  const oldWorkspace = cloudState.workspaceId
  try {
    // Finish pending writes using the old session before changing its cookie.
    await syncAllCloud()
    await flushSave({ deep: true })
    await flushSettings()
    cloudState.paused = true
    localStorage.setItem('fw-cloud-switch', 'switching')
    await drainRecordSync()
    if (cloudState.ready)
      oldCode = (await cloudRequest<{ code: string }>('recovery', { method: 'POST', body: {} })).code
    backup = JSON.parse(JSON.stringify(await getExportedData()))
    const zip = await buildExportZip()
    await set('fw-cloud-restore-backup', { zip, at: Date.now() })
    await saveHashSnapshot('cloud-restore-' + Date.now(), null)
    const session = await cloudRequest<{ workspaceId: string; hasRecords: boolean }>('session', {
      method: 'POST',
      body: { code: restoreCode.value.trim() },
    })
    switched = true
    if (!session.hasRecords) throw new Error('cloud_empty')
    cloudState.workspaceId = session.workspaceId
    // The explicit client is allowed during the pause; background sync is not.
    const ok = await persistence.pullAllRemoteToLocal(Cloud.getInstance())
    if (!ok) throw new Error('cloud_unavailable')
    cloudState.workspaceId = session.workspaceId
    await setMeta('cloudWorkspace', session.workspaceId)
    cloudState.ready = true
    code.value = ''
    restoreCode.value = ''
    confirmed.value = false
    Cloud.setStatus('success')
    Toast.success(t('pull_remote_success'))
    // Recreate active practice state and all watchers against the restored workspace.
    window.location.reload()
  } catch (e) {
    if (switched && backup) {
      try {
        if (oldCode) await cloudRequest('session', { method: 'POST', body: { code: oldCode } })
        else {
          await cloudRequest('disconnect', { method: 'POST', body: {} })
          cloudState.ready = false
        }
        cloudState.workspaceId = oldWorkspace
        // Local rollback only; do not overwrite either cloud workspace on a failed restore.
        await persistence.forcePushLocalDataToRemote(backup.val)
      } catch {
        /* The ZIP backup is retained even if rollback fails. */
      }
    }
    error.value = (e as Error).message.startsWith('cloud_') ? (e as Error).message : 'cloud_unavailable'
  } finally {
    localStorage.setItem('fw-cloud-switch', cloudState.workspaceId + ':' + Date.now())
    cloudState.paused = false
    busy.value = false
  }
}

async function downloadBackup() {
  const backup = await get('fw-cloud-restore-backup')
  if (backup?.zip) saveAs(backup.zip, 'FengWords-before-cloud-restore.zip')
  else Toast.warning(t('no_history_data'))
}
</script>

<template>
  <section class="cloud-panel" :aria-busy="busy">
    <div class="cloud-heading">
      <IconLucideCloud aria-hidden="true" />
      <div>
        <h2>{{ t('cloud_title') }}</h2>
        <p>{{ t('cloud_storage_desc') }}</p>
      </div>
    </div>
    <div class="cloud-status" role="status" aria-live="polite">
      <strong>{{ statusLabel }}</strong>
      <span v-if="cloudState.lastSyncedAt"
        >{{ t('cloud_last_sync') }} {{ new Date(cloudState.lastSyncedAt).toLocaleTimeString() }}</span
      >
      <p v-if="errorLabel" class="cloud-error">{{ errorLabel }}</p>
      <button class="cloud-button" :disabled="busy || cloudState.paused" @click="retry">
        {{ t('cloud_sync_now') }}
      </button>
    </div>
    <div class="cloud-section">
      <h3>{{ t('cloud_recovery_title') }}</h3>
      <p>{{ t('cloud_recovery_desc') }}</p>
      <div class="cloud-actions">
        <button class="cloud-button" :disabled="busy || !cloudState.ready" @click="copyCode">
          {{ t('cloud_copy_code') }}
        </button>
        <input
          v-if="code"
          :value="code"
          readonly
          type="password"
          :aria-label="t('cloud_recovery_title')"
          autocomplete="off"
        />
      </div>
    </div>
    <form class="cloud-section" @submit.prevent="restore">
      <h3>{{ t('cloud_connect_title') }}</h3>
      <label for="cloud-restore-code">{{ t('cloud_recovery_title') }}</label>
      <input
        id="cloud-restore-code"
        v-model="restoreCode"
        type="password"
        autocomplete="off"
        spellcheck="false"
        :disabled="busy"
      />
      <label class="cloud-confirm"
        ><input v-model="confirmed" type="checkbox" :disabled="busy" />{{ t('cloud_restore_confirm') }}</label
      >
      <div class="cloud-actions">
        <button class="cloud-button" :disabled="busy || !confirmed || !restoreCode">
          {{ busy ? t('sync_status_syncing') : t('cloud_connect') }}
        </button>
        <button class="cloud-button secondary" type="button" :disabled="busy" @click="downloadBackup">
          {{ t('cloud_download_backup') }}
        </button>
      </div>
    </form>
  </section>
</template>

<style scoped lang="scss">
.cloud-panel {
  max-width: 44rem;
  line-height: 1.6;
}
.cloud-heading {
  display: flex;
  gap: 1rem;
  align-items: flex-start;
  svg {
    margin-top: 0.4rem;
    font-size: 1.6rem;
    color: var(--color-brand);
    flex-shrink: 0;
  }
}
h2,
h3 {
  margin: 0 0 0.5rem;
  font-weight: 650;
}
h2 {
  font-size: 1.3rem;
}
h3 {
  font-size: 1.05rem;
}
p {
  margin: 0.5rem 0 1rem;
}
.cloud-status {
  background: var(--color-tile);
  border: 1px solid var(--color-line);
  border-radius: var(--radius-control);
  padding: 1.25rem;
  margin: 1.5rem 0;
  strong,
  span {
    display: block;
  }
}
.cloud-error {
  color: var(--color-error, #c2413c);
}
.cloud-section {
  padding: 1.25rem 0;
  border-top: 1px solid var(--color-line);
}
.cloud-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  align-items: center;
  margin-top: 1rem;
}
.cloud-button {
  background: var(--color-brand);
  color: #fff;
  border: 1px solid transparent;
  border-radius: var(--radius-control);
  min-height: 44px;
  padding: 0.5rem 1rem;
  cursor: pointer;
  font: inherit;
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  &.secondary {
    background: var(--color-tile);
    color: inherit;
    border-color: var(--color-line);
  }
}
input:not([type='checkbox']) {
  display: block;
  width: 100%;
  min-height: 44px;
  padding: 0.5rem 0.75rem;
  border: 1px solid var(--color-line);
  border-radius: var(--radius-control);
  color: inherit;
  background: var(--color-tile);
  font: inherit;
  box-sizing: border-box;
  margin-top: 0.5rem;
}
.cloud-confirm {
  display: flex;
  align-items: flex-start;
  gap: 0.6rem;
  margin-top: 1rem;
  input {
    margin-top: 0.5rem;
    flex-shrink: 0;
  }
}
button:focus-visible,
input:focus-visible {
  outline: 2px solid var(--color-brand);
  outline-offset: 3px;
}
</style>
