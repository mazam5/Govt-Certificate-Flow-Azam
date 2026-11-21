"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SEED_PERSONAS = void 0;
exports.main = main;
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
exports.SEED_PERSONAS = [
    {
        id: 'user-anika-001',
        name: 'Anika',
        email: 'anika@pragati.gov.in',
        role: client_1.Role.TRAINING_CENTRE,
        district: 'District A',
        centreCode: 'TC-DISTA-001',
        centreName: 'Pragati Training Centre - District A',
    },
    {
        id: 'user-dev-001',
        name: 'Dev',
        email: 'dev@district-a.gov.in',
        role: client_1.Role.DISTRICT_OFFICER,
        district: 'District A',
    },
    {
        id: 'user-meera-001',
        name: 'Meera',
        email: 'meera@district-a.gov.in',
        role: client_1.Role.DISTRICT_OFFICER,
        district: 'District A',
    },
    {
        id: 'user-kabir-001',
        name: 'Kabir',
        email: 'kabir@district-a.gov.in',
        role: client_1.Role.DISTRICT_OFFICER,
        district: 'District A',
    },
    {
        id: 'user-neha-001',
        name: 'Neha',
        email: 'neha@quality.pragati.gov.in',
        role: client_1.Role.QUALITY_TEAM,
        district: null,
    },
    {
        id: 'user-farah-001',
        name: 'Farah',
        email: 'farah@state.pragati.gov.in',
        role: client_1.Role.STATE_OFFICE,
        district: null,
    },
];
async function main() {
    console.log('🌱 Starting database seeding for CertiFlow...');
    // 1. Create or upsert Training Centre
    const centre = await prisma.trainingCentre.upsert({
        where: { code: 'TC-DISTA-001' },
        update: {},
        create: {
            id: 'tc-dista-001',
            name: 'Pragati Training Centre - District A',
            code: 'TC-DISTA-001',
            district: 'District A',
        },
    });
    console.log(`✅ Training Centre ready: ${centre.name} (${centre.code})`);
    // 2. Upsert Personas
    for (const persona of exports.SEED_PERSONAS) {
        const user = await prisma.user.upsert({
            where: { email: persona.email },
            update: {
                name: persona.name,
                role: persona.role,
                district: persona.district,
                centreId: persona.role === client_1.Role.TRAINING_CENTRE ? centre.id : null,
            },
            create: {
                id: persona.id,
                name: persona.name,
                email: persona.email,
                role: persona.role,
                district: persona.district,
                centreId: persona.role === client_1.Role.TRAINING_CENTRE ? centre.id : null,
            },
        });
        console.log(`👤 Persona seeded: ${user.name} [${user.role}] (${user.district || 'All Districts'})`);
    }
    console.log('✨ Database seeding completed successfully.');
}
if (process.env.NODE_ENV !== 'test') {
    main()
        .catch((e) => {
        console.error('❌ Seeding error:', e);
        process.exit(1);
    })
        .finally(async () => {
        await prisma.$disconnect();
    });
}
