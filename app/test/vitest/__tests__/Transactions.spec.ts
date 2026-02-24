import { flushPromises, type VueWrapper } from "@vue/test-utils";
import App from "src/App.vue";
import { mountComponent, waitFor } from "../utils";
import TransactionList from "src/pages/transactions/TransactionList.vue";
import AccountHeader from "src/components/AccountHeader.vue";
import SelectAccount from "src/components/SelectAccount.vue";
import PageHeader from "src/layouts/PageHeader.vue";
import { seeds } from "src/server";
import { QFabAction, QInput, QList, QMenu } from "quasar";
import SelectGroupExpansion from "src/components/SelectGroupExpansion.vue";
import GroupHeader from "src/components/GroupHeader.vue";
import CreateTransactionSendQR from "src/pages/transactions/CreateTransactionSendQR.vue";
import NfcTagScanner from "src/components/NfcTagScanner.vue";
import TransactionItem from "../../../src/components/TransactionItem.vue";
import DateField from "src/components/DateField.vue";
import { addDays, format } from "date-fns";

// Payment address URL used in QR, link, and scan tests.
const PAYMENT_ADDRESS_URL = "http://localhost:8080/accounting/GRP0/cc/addresses/231baf7c-6231-46c1-9046-23da58abb09a"
const TRANSFERS_ROUTE = "/groups/GRP0/members/EmilianoLemke57/transactions"

describe("Transactions", () => {
  let wrapper: VueWrapper;
  
  beforeAll(async () => {  
    seeds();
    wrapper = await mountComponent(App, { login: true });
    
  });
  afterAll(() => {
    wrapper.unmount();
  });

  /**
   * Helper: click on SelectAccount input and wait for the account list dropdown to open.
   * Returns the QMenu component with the accounts.
   */
  async function openAccountList() {
    await wrapper.getComponent(SelectAccount).get('input').trigger("click");
    await waitFor(
      () => {
        const sa = wrapper.findComponent(SelectAccount);
        return sa.exists() && sa.findComponent(QMenu).exists() ? sa.getComponent(QMenu).findAllComponents(AccountHeader).length > 0 : false;
      },
      true,
      "Account list should open"
    );
    return wrapper.getComponent(SelectAccount).getComponent(QMenu);
  }

  
  it("Loads and searches tansactions", async () => {
    await wrapper.vm.$router.push("/login");
    // Wait for login redirect
    await waitFor(() => wrapper.vm.$route.path, "/home");
    // Click transactions link
    await wrapper.get("#menu-transactions").trigger("click");
    await waitFor(() => wrapper.vm.$route.fullPath, TRANSFERS_ROUTE);
    // Wait for transactions to load.
    await waitFor(
      () => {
        const tl = wrapper.findComponent(TransactionList);
        return tl.exists() ? tl.findAllComponents(TransactionItem).length : 0;
      },
      20,
      "Should load 20 transactions"
    );
    const transactions = wrapper.getComponent(TransactionList).findAllComponents(TransactionItem)
    const first = transactions[3];
    expect(first.text()).toContain("Pending");
    expect(first.text()).toContain("Arnoldo");
    expect(first.text()).toContain("$-7.45");
    expect(first.text()).toContain("multimedia");

    const second = transactions[1];
    expect(second.text()).toContain("today");
    expect(second.text()).toContain("Florida");
    expect(second.text()).toContain("$-22.09");
    expect(second.text()).toContain("Mandatory");
    // Search
    wrapper.getComponent(PageHeader).vm.$emit("search", "object");
    await waitFor(
      () => wrapper.getComponent(TransactionList).findAllComponents(TransactionItem).length,
      2,
      "Should find 2 transactions matching 'object'"
    );
  });

  it("Filters transfers", async () => {
    await wrapper.vm.$router.push("/home");
    await waitFor(() => wrapper.vm.$route.path, "/home");
    await wrapper.get("#menu-transactions").trigger("click");
    await waitFor(() => wrapper.vm.$route.fullPath, TRANSFERS_ROUTE);

    const transactionCount = () => wrapper.getComponent(TransactionList).findAllComponents(TransactionItem).length;

    await waitFor(() => transactionCount() >= 20, true, "Should load transactions before filtering");
    
    // Open filters
    await wrapper.get("button[title='Show filters']").trigger("click");

    const setDateFilter = async (index: number, date: string) => {
      const dateField = wrapper.getComponent(TransactionList).findAllComponents(DateField)[index];
      const input = dateField.findComponent(QInput).get('input');
      await input.setValue(date);
      // Send enter keyup
      await input.trigger("keyup.enter");
      await waitFor(() => dateField.vm.modelValue ? format(dateField.vm.modelValue, "MM/dd/yyyy") : null, date, "Date filter should update model value");
    };

    const clearDateFilter = async (index: number) => {
      const dateField = wrapper.getComponent(TransactionList).findAllComponents(DateField)[index];
      const clearBtn = dateField.find("[aria-label='Clear']");
      await clearBtn.trigger("click");
      await waitFor(() => dateField.vm.modelValue, null, "Date filter should be cleared");
    }

    // Use "start" filter
    const yesterday = format(addDays(new Date(), -1), "MM/dd/yyyy");
    await setDateFilter(0, yesterday);
    await waitFor(() => {
      const count = transactionCount();
      return count < 20 && count > 0;
    } , true, "Start date filter should reduce transfer count");

    const beforeFiltering = transactionCount();

    // Use "end" filter
    await setDateFilter(1, yesterday);
    await waitFor(() => {
      const count = transactionCount();
      return count < beforeFiltering && count > 0;
    }, true, "End date filter should reduce transfer count");

    // Clear both filters
    await clearDateFilter(0);
    await clearDateFilter(1);
    await waitFor(() => transactionCount() >= 20, true, "Should load all transactions after clearing filters");
  })
  it("renders single transaction", async () => {
    await wrapper.vm.$router.push("/groups/GRP0/transactions/55fc265b-c391-4482-8d3c-096c7dc55aa9");
    await waitFor(() => wrapper.text().includes("Cloned executive service-desk"), true, "Transaction details should load");
    const text = wrapper.text();
    expect(text).toContain("Emiliano");
    expect(text).toContain("GRP00000");
    expect(text).toContain("Oleta");
    expect(text).toContain("GRP00003");
    expect(text).toContain("$68.73");
    expect(text).toContain("today at");
    expect(text).toContain("Cloned executive service-desk");
    expect(text).toContain("Committed");
    expect(text).toContain("Group 0");
  })
  it("creates payment request", async () =>  {
    await wrapper.vm.$router.push("/login");
    await waitFor(() => wrapper.vm.$route.path, "/home");
    // Click transactions link
    await wrapper.get("#menu-transactions").trigger("click");
    await waitFor(() => wrapper.vm.$route.fullPath, TRANSFERS_ROUTE);

    // Click "receive" in fab menu
    await wrapper.get(".q-fab").trigger("click");
    const receiveBtn = wrapper.findAllComponents(QFabAction).filter(action => action.text().includes("Receive"))[0];
    expect(receiveBtn.props().to).toBe("/groups/GRP0/members/EmilianoLemke57/transactions/receive");

    await receiveBtn.trigger("click");
    // For some reason the router link does not work in tests, so we directly
    // push the route here. Indeed, the href attribute is missing in the rendered
    // html when testing.
    await wrapper.vm.$router.push(receiveBtn.props().to)
    await waitFor(() => wrapper.vm.$route.fullPath, "/groups/GRP0/members/EmilianoLemke57/transactions/receive");
    await waitFor(() => wrapper.findComponent(SelectAccount).exists(), true, "SelectAccount should render");

    const dialog = await openAccountList();
    const payer = dialog.findAllComponents(AccountHeader)[2]
    expect(payer.text()).toContain("Carol")
    await payer.trigger("click")
    await flushPromises();
    await wrapper.get("[name='description']").setValue("Test transaction description.")
    const button = wrapper.get("button[type='submit']")
    expect(button.attributes("disabled")).toBeDefined()
    await wrapper.get("[name='amount']").setValue("123")
    expect(button.attributes("disabled")).toBeUndefined()

    await button.trigger("click")
    await flushPromises();

    const text = wrapper.text();
    expect(text).toContain("Carol")
    expect(text).toContain("Emiliano")
    expect(text).toContain("123")
    expect(text).toContain("Test transaction description.")

    await wrapper.get("#confirm-transaction").trigger("click")
    await waitFor(() => wrapper.text().includes("Committed"), true, "Transaction should be committed");
  })

  it("creates payment", async() => {
    await wrapper.vm.$router.push("/groups/GRP0/members/EmilianoLemke57/transactions/send")
    await waitFor(() => wrapper.findComponent(SelectAccount).exists(), true, "SelectAccount should render");

    const dialog = await openAccountList();
    const payee = dialog.findAllComponents(AccountHeader)[2]
    expect(payee.text()).toContain("Carol")
    await payee.trigger("click")
    await flushPromises();

    await wrapper.get("[name='description']").setValue("Test payment description.")
    await wrapper.get("[name='amount']").setValue("234")
    await wrapper.get("button[type='submit']").trigger("click")
    await flushPromises();
    const text = wrapper.text();
    expect(text).toContain("Carol");
    expect(text).toContain("Emiliano");
    expect(text).toContain("234");
    expect(text).toContain("Test payment description.");
    await wrapper.get("#confirm-transaction").trigger("click")
    await waitFor(() => wrapper.text().includes("Committed"), true, "Transaction should be committed");
  })

  it("creates external payment - account list", async() => {
    await wrapper.vm.$router.push("/groups/GRP0/members/EmilianoLemke57/transactions/send")
    await waitFor(() => wrapper.findComponent(SelectAccount).exists(), true, "SelectAccount should render");

    const dialog = await openAccountList();
    const groups = dialog.getComponent(SelectGroupExpansion)
    await groups.trigger("click")
    // Choose group 1
    await waitFor(() => {
      return groups.getComponent(QList).findAllComponents(GroupHeader).length
    }, 7)
    await groups.getComponent(QList).findAllComponents(GroupHeader)[1].trigger("click")
    await flushPromises()
    await waitFor(
      () => dialog.findAllComponents(AccountHeader).length > 0,
      true,
      "External group accounts should load"
    );
    const payee = dialog.findAllComponents(AccountHeader)[1]
    expect(payee.text()).toContain("Jaunita")
    await payee.trigger("click")
    await flushPromises();

    await wrapper.get("[name='description']").setValue("Test external payment")
    await wrapper.get("[name='amount']").setValue("12")
    await flushPromises()
    expect((wrapper.get("input[aria-label='Amount in feeds']").element as HTMLInputElement).value).toEqual("120.00")

    await wrapper.get("button[type='submit']").trigger("click")
    await flushPromises();
    
    const text = wrapper.text();
    expect(text).toContain("Jaunita");
    expect(text).toContain("Emiliano");
    expect(text).toContain("$12.00");
    expect(text).toContain("$120.00");
    expect(text).toContain("Test external payment");

    await wrapper.get("#confirm-transaction").trigger("click")
    await waitFor(() => wrapper.text().includes("Committed"), true, "Transaction should be committed");
  })

  it("creates external payment - no list", async() => {
    await wrapper.vm.$router.push("/groups/GRP0/members/EmilianoLemke57/transactions/send")
    await waitFor(() => wrapper.findComponent(SelectAccount).exists(), true, "SelectAccount should render");

    const input = wrapper.getComponent(SelectAccount).get('input')
    const dialog = await openAccountList();
    const groups = dialog.getComponent(SelectGroupExpansion)
    await groups.trigger("click")
    
    // Choose group 2
    const group2 = groups.getComponent(QList).findAllComponents(GroupHeader)[2]
    expect(group2.text()).toContain("Group 2")
    await group2.trigger("click")
    await flushPromises()
    await waitFor(() => dialog.findAllComponents(AccountHeader).length, 0, "External group should have no accounts");
    
    await input.setValue("002")
    await waitFor(() => dialog.findAllComponents(AccountHeader).length, 1)
    // Found account
    await dialog.getComponent(AccountHeader).trigger("click")
    await flushPromises()
    await waitFor(() => wrapper.find("[name='description']").exists(), true, "Transaction form should render");

    await wrapper.get("[name='description']").setValue("Test external payment 2")
    await wrapper.get("[name='amount']").setValue("13")
    await flushPromises()
    await waitFor(
      () => (wrapper.get("input[aria-label='Amount in feeds']").element as HTMLInputElement).value,
      "1,300.00",
      "External currency amount should be calculated"
    );

    await wrapper.get("button[type='submit']").trigger("click")
    await flushPromises();

    const text = wrapper.text();
    expect(text).toContain("GRP20002");
    expect(text).toContain("Emiliano");
    expect(text).toContain("$13.00");
    expect(text).toContain("B/.1,300.00");
    expect(text).toContain("Test external payment 2");

    await wrapper.get("#confirm-transaction").trigger("click")
    await waitFor(() => wrapper.text().includes("Committed"), true, "Transaction should be committed");
  })

  it('creates multiple payments', async () => {
    await wrapper.vm.$router.push("/groups/GRP0/members/EmilianoLemke57/transactions/send")
    await waitFor(() => wrapper.find("a[href='/groups/GRP0/members/EmilianoLemke57/transactions/send/multiple']").exists(), true, "Send page should load");
    await wrapper.get("a[href='/groups/GRP0/members/EmilianoLemke57/transactions/send/multiple']").trigger("click")
    await waitFor(() => wrapper.findAllComponents(SelectAccount).length, 5, "Should show 5 account selectors");
    const payees = wrapper.findAllComponents(SelectAccount)
    for (let i = 0; i < 4; i++) {
      await payees[i].get('input').trigger("click");
      await waitFor(() => payees[i].getComponent(QMenu).findAllComponents(AccountHeader).length > 0, true, `Account list ${i} should open`)
      const payee = payees[i].getComponent(QMenu).findAllComponents(AccountHeader)[i+1]
      await payee.trigger("click")
      await flushPromises()
      await wrapper.get(`[name='description[${i}]']`).setValue(`Test multi ${i+1}`)
      await wrapper.get(`[name='amount[${i}]']`).setValue(`${i+1}`)
      // It required to wait for the menu to close before opening the next one since otherwise
      // the vue framework will throw an error.
      await waitFor(() => payees[i].findComponent(QMenu).isVisible(), false)
    }
    await wrapper.get("button[type='submit']").trigger("click")
    await waitFor(() => wrapper.find("button[name='confirm']").isVisible(), true, "Confirmation button should appear")

    const names = ["Arnoldo", "Carol", "Oleta", "Florida"]
    for (let i = 0; i < 4; i++) {
      expect(wrapper.text()).toContain(names[i])
      expect(wrapper.text()).toContain(`Test multi ${i+1}`)
      expect(wrapper.text()).toContain(`$-${i+1}.00`)
    }
    await wrapper.get("button[name='confirm']").trigger("click")
    
    await waitFor(() => wrapper.vm.$route.fullPath, TRANSFERS_ROUTE)
    await waitFor(() => wrapper.text().includes("Test multi 1"), true, "Transactions should show after redirect");
    expect(wrapper.text()).toContain(`Test multi 4`)
  })

  it('Generate transfer QR', async () => {
    await wrapper.vm.$router.push("/groups/GRP0/members/EmilianoLemke57/transactions/receive/qr")
    await waitFor(() => wrapper.text().includes("build the transfer QR code"), true, "QR form should load")
    expect(wrapper.get("button[type='submit']").attributes("disabled")).toBeDefined()
    await wrapper.get("[name='description']").setValue("Test QR description")
    await wrapper.get("[name='amount']").setValue("12")
    expect(wrapper.get("button[type='submit']").attributes("disabled")).toBeUndefined()
    await wrapper.get("button[type='submit']").trigger("click")
    await waitFor(() => wrapper.text().includes("$12.00"), true, "QR code amount should show")
    expect(wrapper.text()).toContain("Test QR description")
    await waitFor(() => wrapper.find(".q-img img").exists(), true, "QR image should render")
    expect(wrapper.get(".q-img img").attributes("src")).toContain("data:image/png;base64")
  })

  it('Scan transfer QR', async () => {
    await wrapper.vm.$router.push("/groups/GRP0/members/EmilianoLemke57/transactions/send/qr")
    await waitFor(() => wrapper.text().includes("Scan the transfer QR code"), true, "QR scan page should load")
    
    await (wrapper.getComponent(CreateTransactionSendQR) as any)
      .vm.onDetect([{rawValue: `http://localhost:8080/pay?c=${PAYMENT_ADDRESS_URL}&m=Test%20QR%20description&a=120000`}])
    await waitFor(() => wrapper.text().includes("$12.00"), true, "Scanned transfer amount should show")
    expect(wrapper.text()).toContain("Test QR description")
    expect(wrapper.text()).toContain("GRP00004")
    expect(wrapper.text()).toContain("Florida")
    await wrapper.get("button[type='submit']").trigger("click")
    await waitFor(() => wrapper.text().includes("Committed"), true, "Transfer should be committed")
  })

  it('Payment link', async () => {
    await wrapper.vm.$router.push(`/pay?c=${PAYMENT_ADDRESS_URL}&m=Test%20QR%20link&a=135000`)
    await waitFor(() => wrapper.text().includes("$13.50"), true, "Payment link amount should show")
    expect(wrapper.text()).toContain("Test QR link")
    expect(wrapper.text()).toContain("GRP00004")
    expect(wrapper.text()).toContain("Florida")
    await wrapper.get("button[type='submit']").trigger("click")
    await waitFor(() => wrapper.text().includes("Committed"), true, "Payment should be committed")
  })

  it('NFC transfer', async () => {
    await wrapper.vm.$router.push("/groups/GRP0/members/EmilianoLemke57/transactions/receive/nfc")
    await waitFor(() => wrapper.text().includes("before scanning the NFC tag"), true, "NFC page should load")
    expect(wrapper.get("button[type='submit']").attributes("disabled")).toBeDefined()
    await wrapper.get("[name='description']").setValue("Test NFC description")
    await wrapper.get("[name='amount']").setValue("15")
    expect(wrapper.get("button[type='submit']").attributes("disabled")).toBeUndefined()
    await wrapper.get("button[type='submit']").trigger("click")
    await waitFor(() => wrapper.text().includes("$15.00"), true, "NFC amount should show")
    expect(wrapper.text()).toContain("Scanning NFC...")
    // Simulate NFC detection
    wrapper.getComponent(NfcTagScanner).vm.$emit('detected', "31:83:47:8a")
    await waitFor(() => wrapper.text().includes("Committed"), true, "NFC transfer should be committed")
    expect(wrapper.text()).toContain("Carol")
    expect(wrapper.text()).toContain("GRP00002")
    expect(wrapper.text()).toContain("$15.00")
    expect(wrapper.text()).toContain("Test NFC description")
  })
})
