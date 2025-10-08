// Import all icons from assets/contacts
import emailIcon from '../assets/contacts/email.svg'
import facebookIcon from '../assets/contacts/facebook.svg'
import phoneIcon from '../assets/contacts/phone.svg'
import telegramIcon from '../assets/contacts/telegram.svg'
import twitterIcon from '../assets/contacts/twitter.svg'
import websiteIcon from '../assets/contacts/website.svg'
import whatsappIcon from '../assets/contacts/whatsapp.svg'

const icons: { [key: string]: string } = {
  email: emailIcon,
  facebook: facebookIcon,
  phone: phoneIcon,
  telegram: telegramIcon,
  twitter: twitterIcon,
  website: websiteIcon,
  whatsapp: whatsappIcon
}

export function getNetworkIcon(key: string): string {
  return icons[key] || emailIcon // fallback
}

interface SocialNetworkEntry {
  // URL pattern for contact, undefined if not supported 
  contact?: string,
  // URL pattern for share, undefined if not supported
  share?: string,
  // The label key for the network (e.g. "email", "twitter", etc.)
  label: string,
  translateLabel?: boolean,
  // The label key for the identifier field (e.g. username, phone number, etc.)
  idLabel?: string,
  translateIdLabel?: boolean,
  // Whether the parameters in the pattern are raw (not URL encoded)
  rawParameters?: boolean
}

const networks: { [key: string]: SocialNetworkEntry } = {
  phone: {
    contact: "tel:{name}",
    label: "phone",
    translateLabel: true
  },
  email: {
    contact: "mailto:{name}",
    share: "mailto:?subject={title}&body={text}",
    label: "email",
    translateLabel: true
  },
  telegram: {
    contact: "https://t.me/{name}",
    share: "https://t.me/share/url?url={url}&text={text}",
    label: "Telegram",
    idLabel: "username",
    translateIdLabel: true
  },
  whatsapp: {
    contact: "https://api.whatsapp.com/send?phone={name}",
    share: "https://api.whatsapp.com/send?text={text}",
    label: "WhatsApp",
    idLabel: "phone",
    translateIdLabel: true
  },
  twitter: {
    share: "https://twitter.com/intent/tweet?url={url}&text={title}",
    label: "Twitter"
  },
  facebook: {
    share: "https://www.facebook.com/sharer/sharer.php?u={url}&title={title}&description={text}",
    label: "Facebook"
  },
  website: {
    contact: "{name}",
    rawParameters: true,
    label: "website",
    translateLabel: true,
    idLabel: "URL"
  }
}

export function getShareUrl(networkKey: string, url: string, title: string, text: string): string | null {
  const network = networks[networkKey];
  if (network && network.share) {
    return network.share
      .replace("{url}", network.rawParameters ? url : encodeURIComponent(url))
      .replace("{title}", network.rawParameters ? title : encodeURIComponent(title))
      .replace("{text}", network.rawParameters ? text : encodeURIComponent(text));
  }
  return null;
}

export function getContactUrl(networkKey: string, name: string): string | null {
  const network = networks[networkKey];
  if (network && network.contact) {
    return network.contact
      .replace("{name}", network.rawParameters ? name : encodeURIComponent(name));
  }
  return null;
}

export function getNetwork(key: string): SocialNetworkEntry | null {
  return networks[key] || null;
}

export const getNetworks = (keys: string[]): Record<string, SocialNetworkEntry> => {
  return keys.reduce((acc, key) => {
    acc[key] = networks[key];
    return acc;
  }, {} as Record<string, SocialNetworkEntry>);
}

export function getContactNetworkKeys(): string[] {
  return Object.keys(networks).filter(key => networks[key].contact !== undefined);
}
export function getShareNetworkKeys(): string[] {
  return Object.keys(networks).filter(key => networks[key].share !== undefined);
}
