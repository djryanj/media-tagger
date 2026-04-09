## Description

<!-- Describe your changes in detail -->

## Type of Change

<!-- Mark the appropriate option with an "x" -->

- [ ] `feat`: New feature
- [ ] `fix`: Bug fix
- [ ] `docs`: Documentation only changes
- [ ] `style`: Changes that don't affect code meaning (formatting, etc)
- [ ] `refactor`: Code change that neither fixes a bug nor adds a feature
- [ ] `perf`: Performance improvement
- [ ] `test`: Adding or updating tests
- [ ] `chore`: Changes to build process or auxiliary tools
- [ ] `build`: Changes that affect the build system or dependencies
- [ ] `breaking`: Breaking change (add `!` after type, e.g., `feat!:`)
- [ ] `release`: Release a new version

## Component

<!-- Which component does this PR affect? -->

- [ ] API
- [ ] Web UI
- [ ] Metadata handling
- [ ] Tooling/build
- [ ] Docker
- [ ] Devcontainer
- [ ] CI
- [ ] Documentation
- [ ] Other: **\_**

## Checklist

- [ ] My PR title follows the [Conventional Commits](https://www.conventionalcommits.org/) format
  - Example: `feat(api): add multipart upload endpoint`
  - Example: `fix(web): handle download filename parsing`
- [ ] My code follows the project's style guidelines
- [ ] I have performed a self-review of my code
- [ ] I have made corresponding changes to the documentation
- [ ] My changes generate no new warnings or errors
- [ ] I have run the relevant validation target and it passed
  - API changes: `make ci-api`
  - Web changes: `make ci-web`
  - Shared changes: `make ci`

## Related Issues

<!-- Link related issues here -->

Closes #
Related to #

## Additional Notes

<!-- Any additional information -->
