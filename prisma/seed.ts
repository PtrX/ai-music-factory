import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

async function main() {
  const existing = await prisma.preset.findFirst({
    where: { name: "Russian Epic Afro Deep House" },
  })

  if (existing) {
    console.log("Preset already exists, skipping seed.")
    return
  }

  await prisma.preset.create({
    data: {
      name: "Russian Epic Afro Deep House",
      genre: "Afro Deep House, Melodic Afro House, Organic House",
      mood: "Epic, nostalgic, emotional, cinematic, spiritual, uplifting",
      vibe: "Keinemusik, Black Coffee, organic, warm, festival at sunset",
      bpm: 123,
      vocalType: "Deep emotional male vocals, warm baritone",
      sunoStyle:
        "Epic Russian Afro Deep House, melodic afro house, organic percussion, deep emotional male vocals, warm baritone, cinematic strings, acoustic guitar accents, tribal drums, deep sub bass, sunset festival mood, spiritual, nostalgic, heroic, uplifting, premium club production, 123 BPM",
      negativePrompt:
        "No big-room EDM, no dubstep, no aggressive synths, no cheesy dance-pop, no robotic vocals, no trap beat, no lo-fi mix",
    },
  })

  console.log("Seed completed: Russian Epic Afro Deep House preset created.")
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
