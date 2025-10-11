// Mirage typings are not perfect and sometimes we must use any.
/* eslint-disable @typescript-eslint/no-explicit-any */

import type { Server} from "miragejs";
import { Model, belongsTo, hasMany, Factory, Response } from "miragejs";
import faker from "faker";
import { filter } from "./ServerUtils"

import { getContactNetworkKeys } from "../utils/social-networks";
import { config } from "src/utils/config";
import ApiSerializer from "./ApiSerializer";
import { inflections } from "inflected"


const urlSocial = config.SOCIAL_URL;
const urlAccounting = config.ACCOUNTING_URL;

const contactTypes = getContactNetworkKeys();

inflections("en", function (inflect) {
  inflect.irregular("userSettings", "userSettings")
  inflect.irregular("groupSettings", "groupSettings")
})

function fakeMarkdown(paragraphs: number): string {
  let text = "";
  for (let i = 0; i < paragraphs; i++) {
    const sentences = faker.random.number({ min: 2, max: 20 });
    for (let j = 0; j < sentences; j++) {
      let sentence = faker.lorem.sentence();
      if ((i + j) % 8 == 0 && faker.random.boolean()) {
        sentence = "*" + sentence + "*";
      }
      if ((i + j) % 10 == 0 && faker.random.boolean()) {
        sentence = "**" + sentence + "**";
      }
      text += sentence + " ";
    }
    text += "\n\n";
  }
  return text;
}

function fakeContactName(type: string) {
  switch (type) {
    case "whatsapp":
    case "phone":
      return faker.phone.phoneNumberFormat();
    case "telegram":
      return faker.internet.userName();
    case "website":
      return faker.internet.url();
    default:
      return faker.internet.email();
  }
}
// [longitude, latitude]
function fakeLocation() {
  return {
    name: faker.address.county(),
    type: "Point",
    coordinates: [faker.random.number({min:-10, max:40, precision: 4}), faker.random.number({min:0, max:60, precision: 4})]
  };
}

function fakeAddress() {
  return {
    streetAddress: faker.address.streetAddress(),
    addressLocality: faker.address.city(),
    postalCode: faker.address.zipCode(),
    addressRegion: faker.address.county(),
    addressCountry: faker.address.countryCode()
  };
}

function fakeImage(search = "", size = "800x600") {
  return `https://picsum.photos/seed/${search}/${size.replace("x", "/")}`;
}

function fakeCategoryIconName(i: number): string {
  const icons = ["accessibility_new", "accessible_forward", "account_balance", "build", "eco", "house", "agriculture", "hotel", "pedal_bike", "restaurant", "clean_hands"];
  return icons[i % icons.length];
}

function fakePrice(i:number): string {
  if (i % 2 == 0) {
    return "" + (i/100.0)
  } else {
    if (i % 4 == 1) {
      return "Request a quote";
    } else {
      return "Contact me!";
    }
  }
}

/**
 * Object containing the properties to create a MirageJS server that mocks the
 * Komunitin Social API.
 */
export default {
  // Use Mirage JSONAPISerializer to serialize models defined here.
  serializers: {
    group: ApiSerializer.extend({
      links(group: any) {
        const links = {} as { [key: string]: { related: string } };
        (Object.values(group.associations)).forEach(
          (association: any) => {
            links[association.name] = {
              related: ((association.name == "currency") ? urlAccounting : urlSocial) + "/" + group.code + "/" + association.name
            };
          }
        );
        // Only include members, offers and needs for the first two groups, emulating
        // forbidden access.
        if (!["GRP0", "GRP1"].includes(group.code)) {
          delete links['members']
          delete links['offers']
          delete links['needs']
        }
        return links;
      },
      shouldIncludeLinkageData(relationshipKey: string, model: any) {
        return (
          ApiSerializer.prototype.shouldIncludeLinkageData.apply(this, [
            relationshipKey,
            model
          ]) || relationshipKey == "contacts"
        );
      },
      selfLink: (group: any) => urlSocial + "/" + group.code,
      isExternal(relationshipKey: string) {
        return relationshipKey == "currency";
      },
    }),
    member: ApiSerializer.extend({
      shouldIncludeLinkageData(relationshipKey: string, model: any) {
        return (
          ApiSerializer.prototype.shouldIncludeLinkageData.apply(this, [
            relationshipKey,
            model
          ]) || relationshipKey == "contacts"
        );
      },
      selfLink: (member: any) =>
        urlSocial + "/" + member.group.code + "/members/" + member.code,
      isExternal(relationshipKey: string) {
        return relationshipKey == "account";
      },
      links: (member: any) => {
        return {
          account: {
            related: `${urlAccounting}/${member.account.currency.code}/accounts/${member.account.code}`
          }
        }
      }
    }),
    contact: ApiSerializer,
    category: ApiSerializer.extend({
      links(category: any) {
        return {
          offers: {
            related: `${urlSocial}/${category.group.code}/offers?filter[category]=${category.id}`
          },
          needs: {
            related: `${urlSocial}/${category.group.code}/needs?filter[category]=${category.id}`
          }
        };
      },
      selfLink: (category: any) =>
        urlSocial + "/" + category.group.code + "/categories/" + category.id
    }),
    offer: ApiSerializer.extend({
      selfLink: (offer: any) =>
        urlSocial + "/" + offer.group.code + "/offers/" + offer.code
    }),
    need: ApiSerializer.extend({
      selfLink: (need: any) =>
        urlSocial + "/" + need.group.code + "/needs/" + need.code
    }),
    user: ApiSerializer.extend({
      alwaysIncludeLinkageData: true,
      selfLink: (user: any) => `${urlSocial}/users/${user.id}`,
      links(user: any) {
        const member = user.members.models[0];
        return {
          members: {
            related: `${urlSocial}/${member.group.code}/members/${member.id}` 
          }
        }
      }
    }),
    userSettings: ApiSerializer.extend({
      selfLink: (settings: any) => `${urlSocial}/users/${settings.id}/settings`
    }),
    groupSettings: ApiSerializer.extend({
      selfLink: (groupSettings: any) => urlSocial + "/" + groupSettings.group.code + "/settings"
    }),
  },
  models: {
    user: Model.extend({
      members: hasMany(),
      settings: belongsTo("userSettings")
    }),
    userSettings: Model.extend({
      user: belongsTo()
    }),
    group: Model.extend({
      members: hasMany(),
      contacts: hasMany(),
      categories: hasMany(),
      offers: hasMany(),
      needs: hasMany(),
      currency: belongsTo(),
      settings: belongsTo("groupSettings")
    }),
    groupSettings: Model.extend({
      group: belongsTo()
    }),
    member: Model.extend({
      group: belongsTo(),
      contacts: hasMany(),
      account: belongsTo(),
      needs: hasMany(),
      offers: hasMany(),
    }),
    contact: Model,
    category: Model.extend({
      group: belongsTo(),
      offers: hasMany(),
      needs: hasMany()
    }),
    offer: Model.extend({
      category: belongsTo(),
      group: belongsTo(),
      member: belongsTo()
    }),
    need: Model.extend({
      category: belongsTo(),
      group: belongsTo(),
      member: belongsTo()
    })
  },
  factories: {
    user: Factory.extend({
      email: () => faker.internet.email(),
      created: () => faker.date.past(),
      updated: () => faker.date.past(),
    }),
    userSettings: Factory.extend({
      language: "en-us",
      komunitin: true,
      notifications: {
        myAccount: true,
        newNeeds: true,
        newOffers: true,
        newMembers: true
      },
      emails: {
        myAccount: true,
        group: "weekly"
      }
    }),
    group: Factory.extend({
      code: (i: number) => `GRP${i}`,
      name: (i: number) => `Group ${i}`,
      description: () => fakeMarkdown(4),
      image: (i: number) => (i % 2 == 0) ? fakeImage(`group${i}`) : null,
      website: () => faker.internet.url(),
      address: () => {
        return {
          addressLocality: "Barcelona",
          addressCountry: "ES",
          addressRegion: "Catalunya"
        }
      },
      access: "public",
      location: () => fakeLocation(),
      created: () => faker.date.past().toJSON(),
      updated: () => faker.date.recent().toJSON()
    }),
    contact: Factory.extend({
      type: (i: number) => contactTypes[i % contactTypes.length],
      name: (i: number) =>
        fakeContactName(contactTypes[i % contactTypes.length]),
      created: () => faker.date.past().toJSON(),
      updated: () => faker.date.past().toJSON(),
    }),
    member: Factory.extend({
      code() {
        return faker.internet.userName((this).name);
      },
      access: "public",
      state: "active",
      type: () => faker.random.arrayElement(["personal", "business", "public"]),
      name: () => faker.name.findName(),
      description: () => fakeMarkdown(2),
      image: (i: number) => (i % 3 == 0) ? null : fakeImage(`face-${i}`, "100x100"),
      address: () => fakeAddress(),
      location: () => fakeLocation(),
      created: () => faker.date.past(),
      updated: () => faker.date.recent()
    }),
    category: Factory.extend({
      name: () => faker.commerce.department(),
      //code() {
      //  return faker.helpers.slugify((this as any).name);
      //},
      //cpa: (i: number) => ["" + i, "" + 0, "" + 0],
      //description: () => faker.lorem.sentence(),
      icon: (i: number) => (i % 3 == 1) ? null : fakeCategoryIconName(i),
      //access: "public",
      created: () => faker.date.past(),
      updated: () => faker.date.past(),
    }),
    offer: Factory.extend({
      name: () => faker.commerce.product(),
      code(i: number) {
        return faker.helpers.slugify((this).name) + i;
      },
      content: () => fakeMarkdown(faker.random.number({ min: 1, max: 3 })),
      price: () => fakePrice(faker.random.number({min: 1, max:1000})),
      images: (i: number) =>
        Array.from(
          { length: faker.random.number({ min: 0, max: 5 }) },
          (v: never, j: number) => fakeImage(`product${i}-${j}`),
        ),
      access: "public",
      state: "published",
      expires: () => faker.date.future().toJSON(),
      created: () => faker.date.past().toJSON(),
      updated: () => faker.date.recent().toJSON()
    }),
    need: Factory.extend({
      content: () => fakeMarkdown(faker.random.number({min: 1, max: 2})),
      code() {
        return faker.helpers.slugify((this).content.substr(0, 10));
      },
      images: (i: number) => Array.from(
        // Often it's empty.
        { length: Math.max(faker.random.number({ min: -2, max: 2 }), 0) },
        (v: never, j: number) => fakeImage(`need${i}-${j}`)
      ),
      access: "public",
      state: "published",
      expires: () => faker.date.future().toJSON(),
      created: () => faker.date.past().toJSON(),
      updated: () => faker.date.recent().toJSON()
    }),
    groupSettings: Factory.extend({
      requireAcceptTerms: true,
      terms: () => fakeMarkdown(2),
      minOffers: 1,
      minNeeds: 0
    })
  },
  seeds(server: Server) {
    faker.seed(1);
    // Create groups.
    server.createList("group", 7).forEach((group, i) => {
      // Create signup settings.
      const settings = server.create("groupSettings", { group } as any);
      group.update({ settings });
      // Create group contacts.
      faker.seed(1);
      const contacts = server.createList("contact", 4);
      group.update({ contacts });
      // Only add data for the first group. Otherwise we spend a lot of
      // time in this function.
      if (i == 0) {
        // Create categories.
        faker.seed(2030);
        const categories = server.createList("category", 5, { group } as any);
        // Create group members
        faker.seed(1);
        const members = server.createList("member", 30, { group } as any);
        for (let j = 0; j < members.length; j++) {
          const member = members[j];
          // Create member contacts.
          faker.seed(1 + j);
          const contacts = server.createList("contact", 4);
          member.update({ contacts });
          // Create member offers and needs only for the first 10 members.
          if (j < 10) {
            const category = categories[j % categories.length];
            faker.seed(j);
            server.createList("offer", 3, {
              member,
              category,
              group
            } as any);
            // Create member needs only for some members.
            if (j % 3 == 0) {
              faker.seed(j);
              server.createList("need", (j % 3) + 1, {
                member,
                category: categories[j % categories.length],
                group
              } as any);
            }
          }
        }
      }
      // Create some mebers in GRP1 just to test external transfers.
      if (i == 1) {
        server.createList("member", 5, { group } as any);
      }
    });

    // Users and user settings for all members
    (server.schema as any).members.all().models.forEach((member: any) => {
      const user = server.create("user", {
        members: [member]
      } as any);
      server.create("userSettings", { user } as any);	
    });
    
    // Create empty user (for signup testing).
    server.create("user", {
      email: "empty@example.com",
      members: [
        server.create("member", { 
          name: "Empty User",
          code: "empty_user",
          state: "pending",
          type: undefined,
          description: undefined,
          image: undefined,
          address: undefined,
          location: undefined,
          group: (server.schema as any).groups.first()
        } as any)
      ],
      settings: server.create("userSettings")
    } as any)
  },
  routes(server: Server) {
    // All groups
    server.get(urlSocial + "/groups", (schema: any, request) => {
      return filter(schema.groups.all(), request);
    });

    // Single group
    server.get(urlSocial + "/:code", (schema: any, request) => {
      return schema.groups.findBy({ code: request.params.code });
    });

    // Edit group attributes
    server.patch(urlSocial + "/:code", (schema: any, request) => {
      const group = schema.groups.findBy({ code: request.params.code });
      const body = JSON.parse(request.requestBody);
      group.update(body.data.attributes);
      return group;
    });

    // Group settings
    server.get(urlSocial + "/:code/settings", (schema: any, request) => {
      const group = schema.groups.findBy({ code: request.params.code });
      return group.settings;
    });

    // Edit group settings
    server.patch(urlSocial + "/:code/settings", (schema: any, request) => {
      const group = schema.groups.findBy({ code: request.params.code });
      const body = JSON.parse(request.requestBody);
      group.settings.update(body.data.attributes);
      return group.settings;
    });

    // Group categories.
    server.get(urlSocial + "/:code/categories", (schema: any, request) => {
      const group = schema.groups.findBy({ code: request.params.code });
      return schema.categories.where({ groupId: group.id });
    });

    // Create category
    server.post(urlSocial + "/:code/categories", (schema: any, request: any) => {
      const body = JSON.parse(request.requestBody);
      const category = {
        ...body.data.attributes,
        created: new Date().toJSON(),
        updated: new Date().toJSON(),
        groupId: schema.groups.findBy({ code: request.params.code }).id
      }
      return schema.categories.create(category);
    })

    // Update category
    server.patch(urlSocial + "/:code/categories/:category", (schema: any, request: any) => {
      const body = JSON.parse(request.requestBody);
      const category = schema.categories.find(request.params.category);
      category.update({
        ...body.data.attributes,
        updated: new Date().toJSON(),
      })
      return category;
    })

    // Delete category
    server.delete(urlSocial + "/:code/categories/:category", (schema: any, request: any) => {
      const category = schema.categories.find(request.params.category);
      category.destroy();
      return new Response(204);
    })

    // Group offers.
    server.get(urlSocial + "/:code/offers", (schema: any, request: any) => {
      const group = schema.groups.findBy({ code: request.params.code });
      return filter(schema.offers.where({ groupId: group.id }), request);
    });

    // Group offers.
    server.get(urlSocial + "/:code/needs", (schema: any, request: any) => {
      const group = schema.groups.findBy({ code: request.params.code });
      return filter(schema.needs.where({ groupId: group.id }), request);
    });

    // Group members.
    server.get(urlSocial + "/:code/members", (schema: any, request: any) => {
      const group = schema.groups.findBy({ code: request.params.code });
      return filter(schema.members.where({ groupId: group.id }), request);
    });

    // Get group signup settings
    server.get(urlSocial + "/:code/settings", (schema: any, request: any) => {
      const group = schema.groups.findBy({ code: request.params.code });
      return group.settings;
    });

    // Single member.
    server.get(urlSocial + "/:code/members/:member", (schema: any, request: any) => {
      return schema.members.findBy({ id: request.params.member })
      || schema.members.findBy({ code: request.params.member })
      || new Response(404);
    });

    // Edit member profile
    server.patch(urlSocial + "/:code/members/:member", (schema: any, request: any) => {
      const member = schema.members.findBy({ id: request.params.member })
      const body = JSON.parse(request.requestBody);
      member.update(body.data.attributes);
      return member;
    });

    // Delete member
    server.delete(urlSocial + "/:code/members/:id", (schema: any, request: any) => {
      const member = schema.members.find(request.params.id);
      const account = member.account;
      const users = schema.users.where((user: any) => user.memberIds.some((id: any) => id == member.id));
      
      account.destroy();
      member.destroy();
      users.models.forEach((user: any) => user.destroy());

      return undefined as any;
    })

    // Single offer.
    server.get(urlSocial + "/:code/offers/:offer", (schema: any, request: any) => {
      return schema.offers.findBy({ code: request.params.offer });
    });

    // Create offer
    server.post(urlSocial + "/:code/offers", (schema: any, request: any) => {
      const body = JSON.parse(request.requestBody);
      const offer = {
        ...body.data.attributes,
        code: faker.helpers.slugify(body.data.attributes.name.substr(0, 10)),
        created: new Date().toJSON(),
        updated: new Date().toJSON(),
        groupId: schema.groups.findBy({ code: request.params.code }).id,
        memberId: body.data.relationships.member.data.id,
        categoryId: body.data.relationships.category.data.id,
      }
      
      return schema.offers.create(offer);
    })

    // Update offer
    server.patch(urlSocial + "/:code/offers/:offer", (schema: any, request: any) => {
      const body = JSON.parse(request.requestBody);
      const offer = schema.offers.findBy({ code: request.params.offer });
      offer.update({
        ...body.data.attributes,
        updated: new Date().toJSON(),
      })
      return offer;
    })

    // Delete offer
    server.delete(urlSocial + "/:code/offers/:offer", (schema: any, request: any) => {
      const offer = schema.offers.findBy({ code: request.params.offer });
      offer.destroy();
      return undefined as any
    })

    // Single need
    server.get(urlSocial + "/:code/needs/:need", (schema: any, request: any) => {
      return schema.needs.findBy({ code: request.params.need });
    });

    // Create need
    server.post(urlSocial + "/:code/needs", (schema: any, request: any) => {
      const body = JSON.parse(request.requestBody);
      const need = {
        ...body.data.attributes,
        code: faker.helpers.slugify(body.data.attributes.content.substr(0, 10)),
        created: new Date().toJSON(),
        updated: new Date().toJSON(),
        groupId: schema.groups.findBy({ code: request.params.code }).id,
        memberId: body.data.relationships.member.data.id,
        categoryId: body.data.relationships.category.data.id,
      }
      
      return schema.needs.create(need);
    })

    // Update need
    server.patch(urlSocial + "/:code/needs/:need", (schema: any, request: any) => {
      const body = JSON.parse(request.requestBody);
      const need = schema.needs.findBy({ code: request.params.need });
      need.update({
        ...body.data.attributes,
        updated: new Date().toJSON(),
      })
      return need;
    })

    // Delete need
    server.delete(urlSocial + "/:code/needs/:need", (schema: any, request: any) => {
      const need = schema.needs.findBy({ code: request.params.need });
      need.destroy();
      return undefined as any
    })

    server.get(urlSocial + "/users", (schema: any, request: any) => {
      const users = filter(schema.users.all(), request);
      return users;
    });

    // Logged-in User
    server.get(urlSocial + "/users/:id", (schema: any, request: any) => {
      if (request.requestHeaders.Authorization.split(" ")[1] == "empty_user_access_token") {
        return schema.users.findBy({ email: "empty@example.com" });
      } else {
        return (request.params.id === "me" 
          ? schema.users.first() 
          : schema.users.find(request.params.id)
        );
      }
    });

    // User settings
    server.get(urlSocial + "/users/:id/settings", (schema: any, request: any) => {
      return (request.params.id === "me" 
        ? schema.userSettings.first() 
        : schema.users.find(request.params.id).settings
      )
    });

    // Edit user settings
    server.patch(urlSocial + "/users/:id/settings", (schema: any, request: any) => {
      const body = JSON.parse(request.requestBody);
      const settings = (request.params.id === "me" 
        ? schema.userSettings.first() 
        : schema.users.find(request.params.id).settings
      )
      settings.update(body.data.attributes);
      return settings;
    });

    // Create user.
    server.post(urlSocial + "/users", (schema: any, request: any) => {
      const body = JSON.parse(request.requestBody)
      const memberId = body.data.relationships.members.data[0].id
      const memberData = body.included.find((record: any) => record.type == "members" && record.id == memberId)
      
      const group = schema.groups.find(memberData.relationships.group.data.id)
      const member = schema.members.create({...memberData.attributes, group})

      const userSettingsData = body.included.find((record: any) => record.type == "user-settings")
      const userSettings = schema.userSettings.create(userSettingsData.attributes)
      const user = schema.users.create({...body.data.attributes, members: [member], settings: userSettings})
      
       
      console.info("New user created! Follow this URL to contine the signup process:")
       
      console.info(`https://localhost:2030/groups/${group.code}/signup-member?token=empty_user`)

      return user
    });

  }
};
