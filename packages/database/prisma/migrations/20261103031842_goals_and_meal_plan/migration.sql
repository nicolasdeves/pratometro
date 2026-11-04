-- AlterTable
ALTER TABLE "Meal" ADD COLUMN     "planFeedback" JSONB;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "dailyKcalGoal" INTEGER;

-- CreateTable
CREATE TABLE "MealPlan" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "pdf" BYTEA NOT NULL,
    "fileName" TEXT NOT NULL,
    "summary" JSONB NOT NULL,
    "model" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MealPlan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MealPlan_userId_key" ON "MealPlan"("userId");

-- AddForeignKey
ALTER TABLE "MealPlan" ADD CONSTRAINT "MealPlan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
