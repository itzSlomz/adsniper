-- Password sign-in identifies a person by a username, never by email.
-- Nullable: existing rows and magic-link-only accounts carry none.
ALTER TABLE "User" ADD COLUMN "username" TEXT;
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
