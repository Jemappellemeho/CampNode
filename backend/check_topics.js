const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const topics = await prisma.topic.findMany({
    select: {
      id: true,
      name: true,
      articleUrl: true,
      wikidataId: true,
      content: true,
    }
  });
  
  for (const t of topics) {
    console.log(`Topic: ${t.name}`);
    console.log(`  articleUrl: ${t.articleUrl || 'none'}`);
    console.log(`  wikidataId: ${t.wikidataId || 'none'}`);
    console.log(`  content length: ${t.content ? t.content.length : 0}`);
  }
}

main()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());
