import { EnrichedTransferEvent, EnrichedTransferEventAccountData } from "../enriched-events";

type TransferParty = "payer" | "payee";

const getCreditCommonsAddress = (event: EnrichedTransferEvent, who: TransferParty): string | undefined => {
  const creditCommons = (event.transfer.attributes.meta as { creditCommons?: { payerAddress?: string; payeeAddress?: string } } | undefined)?.creditCommons;
  if (!creditCommons) {
    return undefined;
  }
  return who === "payer" ? creditCommons.payerAddress : creditCommons.payeeAddress;
};

export const isExternalTransferSide = (
  event: EnrichedTransferEvent,
  side: EnrichedTransferEventAccountData,
): boolean => !side.currency || side.currency.id !== event.currency.id;

export const isExternalTransfer = (event: EnrichedTransferEvent): boolean => {
  return isExternalTransferSide(event, event.payer) || isExternalTransferSide(event, event.payee);
}

export const getTransferPartyName = (
  event: EnrichedTransferEvent,
  who: TransferParty,
): string => {
  const account = event[who].account;
  const member = event[who].member;

  if (member) {
    return member.attributes.name;
  }

  if ("attributes" in account) {
    return account.attributes.code;
  }

  return getCreditCommonsAddress(event, who) ?? "";
};

export const getTransferPartyGroupName = (
  event: EnrichedTransferEvent,
  who: TransferParty,
): string | undefined => {
  const side = event[who];

  if (side.group) {
    return side.group.attributes.name;
  }

  if (side.currency) {
    const { name, symbol } = side.currency.attributes;
    return `${name} (${symbol})`;
  }

  return undefined;
};

export const getTransferPartyDisplayName = (
  event: EnrichedTransferEvent,
  who: TransferParty,
): string => {
  
  const name = getTransferPartyName(event, who);

  if (!isExternalTransferSide(event, event[who])) {
    return name;
  }

  const groupName = getTransferPartyGroupName(event, who);
  
  if (!groupName) {
    return name;
  }

  if (!name) {
    return groupName;
  }

  return `${name} (${groupName})`;
};
