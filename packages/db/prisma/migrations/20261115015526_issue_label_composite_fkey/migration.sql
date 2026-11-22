/*
  Warnings:

  - A unique constraint covering the columns `[id,organization_id]` on the table `issues` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[id,organization_id]` on the table `labels` will be added. If there are existing duplicate values, this will fail.

*/
-- DropForeignKey
ALTER TABLE "issue_labels" DROP CONSTRAINT "issue_labels_issue_id_fkey";

-- DropForeignKey
ALTER TABLE "issue_labels" DROP CONSTRAINT "issue_labels_label_id_fkey";

-- CreateIndex
CREATE UNIQUE INDEX "issues_id_organization_id_key" ON "issues"("id", "organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "labels_id_organization_id_key" ON "labels"("id", "organization_id");

-- AddForeignKey
ALTER TABLE "issue_labels" ADD CONSTRAINT "issue_labels_issue_id_organization_id_fkey" FOREIGN KEY ("issue_id", "organization_id") REFERENCES "issues"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issue_labels" ADD CONSTRAINT "issue_labels_label_id_organization_id_fkey" FOREIGN KEY ("label_id", "organization_id") REFERENCES "labels"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;
