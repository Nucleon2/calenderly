export class UsernameTakenError extends Error {
  constructor(username: string) {
    super(`Username "${username}" is already taken`);
    this.name = "UsernameTakenError";
  }
}

export class UserNotFoundError extends Error {
  constructor(userId: string) {
    super(`User "${userId}" was not found`);
    this.name = "UserNotFoundError";
  }
}
