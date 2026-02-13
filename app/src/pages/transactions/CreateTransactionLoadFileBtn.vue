<template>
  <dialog-form-btn
    :label="$t('importFile')"
    :text="$t('importFileText')"
    :submit="importFile"
    :valid="!!file"
    icon="attach_file"
  >
    <template #default>
      <q-file 
        v-model="file"
        outlined
        :label="$t('selectFile')"
        :hint="$t('selectFileHint')"
        accept=".csv, .txt"
        max-file-size="10000"
        :error-message="fileErrorMessage"
        :error="!!fileErrorMessage"
      >
        <template #append>
          <q-icon name="attach_file" />
        </template>
      </q-file>
    </template>
  </dialog-form-btn>
</template>
<script setup lang="ts">
import { computed, ref } from "vue"
import { useI18n } from "vue-i18n"
import KError, { KErrorCode, translateKError } from 'src/KError';
import DialogFormBtn from 'src/components/DialogFormBtn.vue';
import { readCSV } from 'src/plugins/Files';
import { normalizeAccountCode, parseAmount } from 'src/plugins/FormatCurrency';
import type { TransferRow } from "./CreateTransactionMultiple.vue";
import { useStore } from "vuex";
import type { ExtendedAccount } from "src/store/model";

const props = defineProps<{
  code: string,
  direction: "send" | "receive" | "transfer",
  payerAccount: ExtendedAccount | undefined,
  payeeAccount: ExtendedAccount | undefined
}>()
const emit = defineEmits<{
  (e:'import', transfers: TransferRow[]): void
}>()

const { t } = useI18n()
const store = useStore()
const myCurrency = computed(() => store.getters.myAccount.currency)

// File import
const file = ref<File|null>()
const fileErrorMessage = ref<string>("")

const fetchAccountByCode = async (code: string) => {
  code = normalizeAccountCode(code, myCurrency.value)
  // Try getting the account from cache.
  let account = store.getters["accounts/find"]({code})
  if (!account) {
    // Otherwise try fetching it from the server.
    await store.dispatch("accounts/load", {
      code,
      group: props.code
    })
    account = store.getters["accounts/find"]({code})
  }
  return account as ExtendedAccount
}

const parseTransfersFile = async (content: string[][]) : Promise<TransferRow[]> => {
  let line = 1
  let column = 1
  try {
  const headers = content[0]
  if (headers.length !== 4) {
    throw new KError(KErrorCode.InvalidTransfersCSVFile)
  }
  // Check if the first row contains headers or actual data, by checking if the
  // last cell of the first row is a number.
  const lastHeader = headers[headers.length - 1]
  if (parseAmount(lastHeader, myCurrency.value) === false) {
    content.shift()
    line++
  }
  const parsed = []
  // Parse the rest of the rows
  for (const row of content) {
    column = 1
    if (row.length !== 4) {
      throw new KError(KErrorCode.InvalidTransfersCSVFile)
    }

    // Check payer
    const payer = await fetchAccountByCode(row[0])
    if (!payer) {
      throw new KError(KErrorCode.AccountNotFound)
    }
    if (props.direction === "send" && payer.attributes.code !== props.payerAccount?.attributes.code) {
      throw new KError(KErrorCode.AccountIsNotYours)
    }
    
    // Check payee
    column = 2
    const payee = await fetchAccountByCode(row[1])
    if (!payee) {
      throw new KError(KErrorCode.AccountNotFound)
    }
    if (props.direction === "receive" && payee.attributes.code !== props.payeeAccount?.attributes.code) {
      throw new KError(KErrorCode.AccountIsNotYours)
    }

    // Check description
    column = 3
    const description = row[2]
    if (description === "") {
      throw new KError(KErrorCode.DescriptionRequired)
    }

    // Check amount
    column = 4
    const amount = parseAmount(row[3], myCurrency.value, {scale: false})
    if (amount === false) {
      throw new KError(KErrorCode.InvalidAmount)
    }

    parsed.push({
      payer,
      payee,
      description,
      amount
    })

    line++
  }
  return parsed
  } catch (error) {
    throw new KError(KErrorCode.InvalidTransfersCSVFile, "Error parsing transfers file", error, {line, column})
  }
}

const importFile = async () => {
  // Load file content and parse CSV.
  fileErrorMessage.value = ""
  try {
    // Import button is disabled if file is not defined
    const content = await readCSV(file.value)
    const rows = await parseTransfersFile(content)
    // Update table
    emit("import", rows)
  } catch (error) {
    if (error instanceof KError && error.code === KErrorCode.InvalidTransfersCSVFile && error.debugInfo) {
      const debugInfo = error.debugInfo as {line: number, column: number}
      fileErrorMessage.value = t("ErrorInvalidTransfersCSVFileLineColumn", {line: debugInfo.line, column: debugInfo.column})  
    } else {
      fileErrorMessage.value = t("ErrorInvalidTransfersCSVFile")
    }
    if (error?.cause instanceof KError) {
      fileErrorMessage.value += ". " + translateKError(t, error.cause)
    }
    // Rethrow anyway to prevent the dialog from closing.
    throw error
  }
}

</script>
