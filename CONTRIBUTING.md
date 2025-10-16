# Contributing to Komunitin

We welcome contributions to Komunitin! You can contribute in several ways:

* **Code contributions:** Submit pull requests to improve the project.

* **Bug reports:** Help us identify and fix issues.

* **Other issues:** Suggest new features or improvements.

## Contributing Issues

To contribute issues, please follow these guidelines:

* **Search for duplicates first:** Before submitting a new issue, please search the existing issues to avoid duplicates. If you find a similar issue, add a 👍 reaction and/or a comment to support it.

* **Provide detailed information:**

    * **For bug reports:** Include detailed step-by-step instructions to reproduce the bug.

    * **For new features:** Focus on describing what you would like to see, rather than how it should be implemented. The technical details can be discussed later.

* **Keep issues small and actionable:** This makes them easier to understand, address, and resolve.

## Contributing Code

To contribute code, please follow these steps:

1.  Fork the repository.

2.  Create a new branch for your changes.

3.  Add tests for your new code.

4.  Ensure that all existing tests pass.

5.  Submit a pull request with your changes to the `master` branch.

## Contributing Translations

Language files are located in several places in the repository, specifically:

1. `/app/src/i18n/[LANGUAGE_CODE]/index.json`: Strings in the app facing regular users.
2. `/app/src/i18n/[LANGUAGE_CODE]/admin.json`: Strings in the admin interface.
3. `/app/src-pwa/i18n/[LANGUAGE_CODE].json`: Strings for push messages.
4. `/notifications/i18n/messages/[LANGUAGE_CODE].json`: Strings for email notifications.

In order to add or change translations in an existing language, just modify the relevant files.

To add a new language, in addition to adding the files and folders:
1. Add the new language entry to the langs record in `/app/src/i18n/index.ts`.
2. Import the new language and add it to the languages array in `/app/src-pwa/i18n/index.ts`.

Once you have made your changes, please follow the steps for contributing code above.

## Contributing Flavors
Komunitin supports different "flavors" to customize the application. The flavor is set using the `KOMUNITIN_FLAVOR` environment variable (in the main `.env` file) or using the `FLAVOR` environment variable in the ap folder.

1. **Environment variables**: You can edit the flavor-specific environment variable files named `.env.flavor.[FLAVOR_NAME]` in the `app/` directory.
2. **Assets**: You can customize bundled assets including logos and imagery by placing them in the `assets/flavors/[FLAVOR_NAME]/` directory.
3. **Public files**: You can customize public files including `favicon.ico` by placing them in the `public/flavors/[FLAVOR_NAME]/` directory.
4. **Styles**: You can customize styles by modifying the `app/src/css/flavors/override.variables.sass`. Here you can override quasar variables that will be available in every component.


## Community Note

Komunitin is a community-maintained project, and there is no company behind it. Please understand that it may take us some time to respond to your inquiries or review your contributions.

❤️ Thanks for your contribution! ❤️
