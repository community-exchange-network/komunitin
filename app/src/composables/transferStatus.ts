import type { MaybeRefOrGetter } from "vue";
import { computed, toValue } from "vue";
import type { TransferState } from "../store/model";
import { useI18n } from "vue-i18n";

type T = ReturnType<typeof useI18n>['t']

// Badge background and text colors, from the app palette.
const STATUS_MAP = {
  new: { color: 'transfer-new', textColor: 'on-surface-medium', label: (t: T) => t('new') },
  pending: { color: 'transfer-pending', textColor: 'primary', label: (t: T) => t('pending') },
  accepted: { color: 'transfer-accepted', textColor: 'on-surface-medium', label: (t: T) => t('accepted') },
  committed: { color: 'transfer-committed', textColor: 'secondary', label: (t: T) => t('committed') },
  rejected: { color: 'transfer-rejected', textColor: 'on-surface-medium', label: (t: T) => t('rejected') },
  failed: { color: 'transfer-failed', textColor: 'on-surface-low', label: (t: T) => t('failed') },
  deleted: { color: 'transfer-deleted', textColor: 'on-surface-low', label: (t: T) => t('deleted') },
}

export const useTransferStatus = (status: MaybeRefOrGetter<TransferState>) => {
  const { t } = useI18n();

  const entry = computed(() => STATUS_MAP[toValue(status)])
  const color = computed(() => entry.value.color)
  const textColor = computed(() => entry.value.textColor)
  const label = computed(() => entry.value.label(t))

  return { color, textColor, label };
};
