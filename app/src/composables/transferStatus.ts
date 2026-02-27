import type { MaybeRefOrGetter } from "vue";
import { computed, toValue } from "vue";
import type { TransferState } from "../store/model";
import { useI18n } from "vue-i18n";

type T = ReturnType<typeof useI18n>['t']

const STATUS_MAP = {
  new: { color: 'light-blue', label: (t: T) => t('new') },
  pending: { color: 'orange', label: (t: T) => t('pending') },
  accepted: { color: 'teal', label: (t: T) => t('accepted') },
  committed: { color: 'green', label: (t: T) => t('committed') },
  rejected: { color: 'red', label: (t: T) => t('rejected') },
  failed: { color: 'deep-orange', label: (t: T) => t('failed') },
  deleted: { color: 'grey', label: (t: T) => t('deleted') },
}

export const useTransferStatus = (status: MaybeRefOrGetter<TransferState>) => {
  const { t } = useI18n();

  const entry = computed(() => STATUS_MAP[toValue(status)])
  const color = computed(() => entry.value?.color ?? 'blue-grey')

  const label = computed(() => entry.value?.label(t) ?? toValue(status))

  return { color, label };
};
