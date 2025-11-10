import { flushPromises, VueWrapper } from "@vue/test-utils";
import App from "src/App.vue";
import { mountComponent, waitFor } from "../utils";
import TransactionList from "src/pages/transactions/TransactionList.vue";
import AccountHeader from "src/components/AccountHeader.vue";
import SelectAccount from "src/components/SelectAccount.vue";
import PageHeader from "src/layouts/PageHeader.vue";
import { seeds } from "src/server";
import { QFabAction, QList, QMenu } from "quasar";
import SelectGroupExpansion from "src/components/SelectGroupExpansion.vue";
import GroupHeader from "src/components/GroupHeader.vue";
import CreateTransactionSendQR from "src/pages/transactions/CreateTransactionSendQR.vue";
import NfcTagScanner from "src/components/NfcTagScanner.vue";
import TransactionItem from "../../../src/components/TransactionItem.vue";
import CreateTransactionBtn from "../../../src/components/CreateTransactionBtn.vue";

describe("Transactions", () => {
  let wrapper: VueWrapper;
  
  beforeAll(async () => {  
    seeds();
    wrapper = await mountComponent(App, { login: true });
    
  });
  afterAll(() => {
    wrapper.unmount();
  });

  
  it("Loads and searches tansactions", async () => {
    await wrapper.vm.$router.push("/login");
    // Wait for login redirect
    await flushPromises();
    // Click transactions link
    await wrapper.get("#menu-transactions").trigger("click");
    await flushPromises();
    expect(wrapper.vm.$route.fullPath).toBe("/groups/GRP0/members/EmilianoLemke57/transactions");
    // Further wait to load members.
    await flushPromises();
    await wrapper.vm.$wait();
    const transactions = wrapper.getComponent(TransactionList).findAllComponents(TransactionItem)
    expect(transactions.length).toBe(20);
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
    await wrapper.vm.$wait();
    // Check result!
    expect(wrapper.getComponent(TransactionList).findAllComponents(TransactionItem).length).toBe(2);
  });
  it("renders single transaction", async () => {
    await wrapper.vm.$router.push("/groups/GRP0/transactions/55fc265b-c391-4482-8d3c-096c7dc55aa9");
    await wrapper.vm.$wait();
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
    await flushPromises();
    // Click transactions link
    await wrapper.get("#menu-transactions").trigger("click");
    await flushPromises();

    // Click "receive" in fab menu
    await wrapper.get(".q-fab").trigger("click");
    const receiveBtn = wrapper.findAllComponents(QFabAction).filter(action => action.text().includes("Receive"))[0]; 
    expect(receiveBtn.props().to).toBe("/groups/GRP0/members/EmilianoLemke57/transactions/receive")

    await receiveBtn.trigger("click");
    // For some reason the router link does not work in tests, so we directly
    // push the route here. Indeed, the href attribute is missing in the rendered
    // html when testing.
    await wrapper.vm.$router.push(receiveBtn.props().to)
    expect(wrapper.vm.$route.fullPath).toBe("/groups/GRP0/members/EmilianoLemke57/transactions/receive");
    await wrapper.vm.$wait()

    await wrapper.getComponent(SelectAccount).get('input').trigger("click");
    await wrapper.vm.$wait()

    const dialog = wrapper.getComponent(SelectAccount).getComponent(QMenu)
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
    expect(text).toContain("today")
    expect(text).toContain("New")


    await wrapper.get("#confirm-transaction").trigger("click")
    await wrapper.vm.$wait();
    expect(wrapper.text()).toContain("Committed")

  })

  it("creates payment", async() => {
    await wrapper.vm.$router.push("/groups/GRP0/members/EmilianoLemke57/transactions/send")
    await wrapper.vm.$wait();

    await wrapper.getComponent(SelectAccount).get('input').trigger("click");
    await flushPromises()
    await wrapper.vm.$wait()

    const dialog = wrapper.getComponent(SelectAccount).getComponent(QMenu)
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
    expect(text).toContain("today")
    await wrapper.get("#confirm-transaction").trigger("click")
    await wrapper.vm.$wait();
    expect(wrapper.text()).toContain("Committed")
  })

  it("creates external payment - account list", async() => {
    await wrapper.vm.$router.push("/groups/GRP0/members/EmilianoLemke57/transactions/send")
    await wrapper.vm.$wait();

    await wrapper.getComponent(SelectAccount).get('input').trigger("click");
    await flushPromises()
    await wrapper.vm.$wait()

    const dialog = wrapper.getComponent(SelectAccount).getComponent(QMenu)
    const groups = dialog.getComponent(SelectGroupExpansion)
    await groups.trigger("click")
    // Choose group 1
    await waitFor(() => {
      return groups.getComponent(QList).findAllComponents(GroupHeader).length
    }, 7)
    await groups.getComponent(QList).findAllComponents(GroupHeader)[1].trigger("click")
    await flushPromises()
    await wrapper.vm.$wait()
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
    expect(text).toContain("$-12.00");
    expect(text).toContain("($-120.00)");
    expect(text).toContain("Test external payment");
    expect(text).toContain("today")

    await wrapper.get("#confirm-transaction").trigger("click")
    await wrapper.vm.$wait();
    expect(wrapper.text()).toContain("Committed")
  })

  it("creates external payment - no list", async() => {
    await wrapper.vm.$router.push("/groups/GRP0/members/EmilianoLemke57/transactions/send")
    await wrapper.vm.$wait();

    const input = wrapper.getComponent(SelectAccount).get('input')
    await input.trigger("click");
    await flushPromises()
    await wrapper.vm.$wait()

    const dialog = wrapper.getComponent(SelectAccount).getComponent(QMenu)
    const groups = dialog.getComponent(SelectGroupExpansion)
    await groups.trigger("click")
    
    // Choose group 2
    const group2 = groups.getComponent(QList).findAllComponents(GroupHeader)[2]
    expect(group2.text()).toContain("Group 2")
    await group2.trigger("click")
    await flushPromises()
    await wrapper.vm.$wait()
    // No accounts
    expect(dialog.findAllComponents(AccountHeader).length).toBe(0)
    
    await input.setValue("002")
    await waitFor(() => dialog.findAllComponents(AccountHeader).length, 1)
    // Found account
    await dialog.getComponent(AccountHeader).trigger("click")
    await flushPromises()
    await wrapper.vm.$wait()

    await wrapper.get("[name='description']").setValue("Test external payment 2")
    await wrapper.get("[name='amount']").setValue("13")
    await flushPromises()
    await wrapper.vm.$wait();
    expect((wrapper.get("input[aria-label='Amount in feeds']").element as HTMLInputElement).value).toEqual("1,300.00")

    await wrapper.get("button[type='submit']").trigger("click")
    await flushPromises();

    const text = wrapper.text();
    expect(text).toContain("GRP20002");
    expect(text).toContain("Emiliano");
    expect(text).toContain("$-13.00");
    expect(text).toContain("(B/.-1,300.00)");
    expect(text).toContain("Test external payment 2");
    expect(text).toContain("today")

    await wrapper.get("#confirm-transaction").trigger("click")
    await wrapper.vm.$wait();
    expect(wrapper.text()).toContain("Committed")
  })

  it('creates multiple payments', async () => {
    await wrapper.vm.$router.push("/groups/GRP0/members/EmilianoLemke57/transactions/send")
    await wrapper.vm.$wait();
    await wrapper.get("a[href='/groups/GRP0/members/EmilianoLemke57/transactions/send/multiple']").trigger("click")
    await wrapper.vm.$wait();
    const payees = wrapper.findAllComponents(SelectAccount)
    expect(payees.length).toBe(5)
    for (let i = 0; i < 4; i++) {
      await payees[i].get('input').trigger("click");
      await waitFor(() => payees[i].getComponent(QMenu).findAllComponents(AccountHeader).length > 0)
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
    await waitFor(() => wrapper.find("button[name='confirm']").isVisible())

    const names = ["Arnoldo", "Carol", "Oleta", "Florida"]
    for (let i = 0; i < 4; i++) {
      expect(wrapper.text()).toContain(names[i])
      expect(wrapper.text()).toContain(`Test multi ${i+1}`)
      expect(wrapper.text()).toContain(`$-${i+1}.00`)
    }
    await wrapper.get("button[name='confirm']").trigger("click")
    
    await waitFor(() => wrapper.vm.$route.fullPath, "/groups/GRP0/members/EmilianoLemke57/transactions")

    expect(wrapper.text()).toContain(`Test multi 1`)
    expect(wrapper.text()).toContain(`Test multi 4`)
  })

  it('Generate transfer QR', async () => {
    await wrapper.vm.$router.push("/groups/GRP0/members/EmilianoLemke57/transactions/receive/qr")
    await waitFor(() => wrapper.text().includes("build the transaction QR code"))
    expect(wrapper.get("button[type='submit']").attributes("disabled")).toBeDefined()
    await wrapper.get("[name='description']").setValue("Test QR description")
    await wrapper.get("[name='amount']").setValue("12")
    expect(wrapper.get("button[type='submit']").attributes("disabled")).toBeUndefined()
    await wrapper.get("button[type='submit']").trigger("click")
    await waitFor(() => wrapper.text().includes("$12.00"))
    expect(wrapper.text()).toContain("$12.00")
    expect(wrapper.text()).toContain("Test QR description")
    await waitFor(() => wrapper.find(".q-img img").exists())
    expect(wrapper.get(".q-img img").attributes("src")).toContain("data:image/png;base64")
  })

  it('Scan transfer QR', async () => {
    await wrapper.vm.$router.push("/groups/GRP0/members/EmilianoLemke57/transactions/send/qr")
    await waitFor(() => wrapper.text().includes("Scan the transfer QR code"))
    
    await (wrapper.getComponent(CreateTransactionSendQR) as any)
      .vm.onDetect([{rawValue: "http://localhost:8080/pay?c=http://localhost:8080/accounting/GRP0/cc/addresses/231baf7c-6231-46c1-9046-23da58abb09a&m=Test%20QR%20description&a=120000"}])
    await waitFor(() => wrapper.text().includes("$-12.00"))
    expect(wrapper.text()).toContain("Test QR description")
    expect(wrapper.text()).toContain("GRP00004")
    expect(wrapper.text()).toContain("Florida")
    await wrapper.get("button[type='submit']").trigger("click")
    await waitFor(() => wrapper.text().includes("Committed"))
  })

  it('Payment link', async () => {
    await wrapper.vm.$router.push("/pay?c=http://localhost:8080/accounting/GRP0/cc/addresses/231baf7c-6231-46c1-9046-23da58abb09a&m=Test%20QR%20link&a=135000")
    await waitFor(() => wrapper.text().includes("$-13.50"))
    expect(wrapper.text()).toContain("Test QR link")
    expect(wrapper.text()).toContain("GRP00004")
    expect(wrapper.text()).toContain("Florida")
    await wrapper.get("button[type='submit']").trigger("click")
    await waitFor(() => wrapper.text().includes("Committed"))
  })

  it('NFC transfer', async () => {
    await wrapper.vm.$router.push("/groups/GRP0/members/EmilianoLemke57/transactions/receive/nfc")
    await waitFor(() => wrapper.text().includes("before scanning the NFC tag"))
    expect(wrapper.get("button[type='submit']").attributes("disabled")).toBeDefined()
    await wrapper.get("[name='description']").setValue("Test NFC description")
    await wrapper.get("[name='amount']").setValue("15")
    expect(wrapper.get("button[type='submit']").attributes("disabled")).toBeUndefined()
    await wrapper.get("button[type='submit']").trigger("click")
    await waitFor(() => wrapper.text().includes("$15.00"))
    expect(wrapper.text()).toContain("Scanning NFC...")
    // Simulate NFC detection
    wrapper.getComponent(NfcTagScanner).vm.$emit('detected', "31:83:47:8a")
    await waitFor(() => wrapper.text().includes("Committed"))
    expect(wrapper.text()).toContain("Carol")
    expect(wrapper.text()).toContain("GRP00002")
    expect(wrapper.text()).toContain("$15.00")
    expect(wrapper.text()).toContain("Test NFC description")
  })
})
