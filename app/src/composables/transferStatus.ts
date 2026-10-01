import type { MaybeRefOrGetter } from "vue";
import { computed, toValue } from "vue";
import type { TransferState } from "../store/model";
import { useI18n } from "vue-i18n";

type T = ReturnType<typeof useI18n>['t']

// Badge background and text colors, from the app palette.
const STATUS_MAP = {
  new: { color: 'surface-container-h', textColor: 'onsurface-m', label: (t: T) => t('new') },
  pending: { color: 'pending', textColor: 'primary', label: (t: T) => t('pending') },
  accepted: { color: 'accent-muted', textColor: 'onsurface-m', label: (t: T) => t('accepted') },
  committed: { color: 'committed', textColor: 'secondary', label: (t: T) => t('committed') },
  rejected: { color: 'rejected', textColor: 'onsurface-m', label: (t: T) => t('rejected') },
  failed: { color: 'failed', textColor: 'onsurface-d', label: (t: T) => t('failed') },
  deleted: { color: 'surface-container-h', textColor: 'onsurface-d', label: (t: T) => t('deleted') },
}

export const useTransferStatus = (status: MaybeRefOrGetter<TransferState>) => {
  const { t } = useI18n();

  const entry = computed(() => STATUS_MAP[toValue(status)])
  const color = computed(() => entry.value.color)
  const textColor = computed(() => entry.value.textColor)
  const label = computed(() => entry.value.label(t))

  return { color, textColor, label };
};
