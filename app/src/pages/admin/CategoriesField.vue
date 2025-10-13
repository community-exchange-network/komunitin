<template>
  <q-table
    class="text-onsurface-m"
    :rows="categories"
    :columns="columns"
    flat
    hide-bottom
    :pagination="{rowsPerPage: 0}"
  >
    <template #body="slot">
      <q-tr :props="slot">
        <q-td 
          key="category"  
          :props="slot"
        >
          <category-avatar
            type="offer"
            :category="slot.row"
            caption
          />
        </q-td>
        <q-td 
          key="offers"
          :props="slot"
        >
          {{ slot.row.relationships.offers.meta.count }}
        </q-td>
        <q-td 
          key="needs"
          :props="slot"
        >
          {{ slot.row.relationships.needs.meta.count }}
        </q-td>
        <q-td 
          key="actions"
          :props="slot"
        >
          <q-btn
            flat
            round
            icon="edit"
            color="onsurface-m"
            @click="edit(slot.row)"
          />
          <delete-btn 
            color="onsurface-m"
            @confirm="remove(slot.row)"
          >
            {{ $t('deleteCategoryConfirmation', {name: slot.row.attributes.name}) }}
          </delete-btn>
        </q-td>
      </q-tr>
    </template>
  </q-table>
  <div class="row justify-end">
    <q-btn
      flat
      color="primary"
      :label="$t('addCategory')"
      @click="add"
    />
  </div>
  <q-dialog 
    v-model="showDialog"
  >
    <q-card
      style="min-width: 50vw;"
    >
      <q-card-section>
        <div class="flex justify-between">
          <div class="text-h6">
            {{ actionLabel }}
          </div>
          <q-btn
            flat
            round
            icon="close"
            style="margin-top: -8px; margin-right: -8px;"
            @click="showDialog = false"
          />
        </div>
      </q-card-section>
      <q-card-section class="q-gutter-y-md">
        <q-input
          v-model="name"
          :label="$t('categoryName')"
          outlined
        />
        <div class="text-onsurface-m">
          {{ $t('categoryIcon') }}
        </div>
        <AsyncIconPicker
          v-model="icon"
        />        
      </q-card-section>
      <q-card-section align="right">
        <q-btn
          unelevated
          color="primary"
          :label="$t('save')"
          :disable="saveDisabled"
          @click="saveCategory()"
        />
      </q-card-section>
    </q-card>
  </q-dialog>
</template>
<script setup lang="ts">
import CategoryAvatar from 'src/components/CategoryAvatar.vue';
import DeleteBtn from 'src/components/DeleteBtn.vue';
import type { Category } from 'src/store/model';
import { computed, defineAsyncComponent, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { QSpinner, type DeepPartial } from 'quasar';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const props = defineProps<{
  categories: Category[]
}>()

const emit = defineEmits<{
  (e: 'create:category', value: DeepPartial<Category>): void,
  (e: 'update:category', value: DeepPartial<Category>): void,
  (e: 'delete:category', value: DeepPartial<Category>): void
}>()

const { t } = useI18n()

const columns = [
  { name: 'category', align: 'left', label: t('category') },
  { name: 'offers', align: 'right', label: t('offers') },
  { name: 'needs', align: 'right', label: t('needs') },
  { name: 'actions', align: 'right', label: "" }
]

const showDialog = ref(false)
const action = ref<'edit'|'add'>('add')
const actionLabel = computed(() => action.value === 'add' ? t('addCategory') : t('editCategory'))
const editingCategory = ref<Category>()

const name = ref('')
const icon = ref('')

const saveDisabled = computed(() => !name.value || !icon.value)

const edit = (category: Category) => {
  action.value = 'edit'
  name.value = category.attributes.name
  icon.value = category.attributes.icon
  editingCategory.value = category
  showDialog.value = true
}

const remove = (category: Category) => {
  emit('delete:category', category as DeepPartial<Category>)
}

const add = () => {
  action.value = 'add'
  name.value = ''
  icon.value = ''
  editingCategory.value = undefined
  showDialog.value = true
}

const saveCategory = () => {
  if (action.value === 'add') {
    emit('create:category', {
      type: 'categories',
      attributes: {
        name: name.value,
        icon: icon.value
      }
    })
  } else {
    emit('update:category', {
      ...editingCategory.value,
      attributes: {
        name: name.value,
        icon: icon.value
      }
    } as DeepPartial<Category>)
  }
  showDialog.value = false
}

const AsyncIconPicker = defineAsyncComponent({
  loader: () => import('./IconPicker.vue'),
  loadingComponent: QSpinner,
  delay: 100,
  timeout: 10000
})

</script>
