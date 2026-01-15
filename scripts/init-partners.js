require('dotenv').config();
const { MongoClient } = require('mongodb');

const url = process.env.MONGODB_URL;
const dbName = process.env.MONGODB_DATABASE;

// Partner data - updated 2025
const partnersData = [
  {
    order: 1,
    domain: 'broccoli014.com',
    name: '升方蓮',
    nameKatakana: '',
    monthlyAmount: 11000,
    paymentCycle: '当月',
    startDate: new Date('2024-05-18'),
    stopDate: null,
    email: '',
    phone: '',
    address: '',
    bankInfo: {
      bankName: '',
      branchName: '',
      accountType: '普通',
      accountNumber: '',
      accountHolder: ''
    },
    notes: ''
  },
  {
    order: 2,
    domain: 'damablog.com',
    name: '児玉尭史',
    nameKatakana: '',
    monthlyAmount: 10000,
    paymentCycle: '当月',
    startDate: new Date('2025-05-30'),
    stopDate: null,
    email: '',
    phone: '',
    address: '',
    bankInfo: {
      bankName: '',
      branchName: '',
      accountType: '普通',
      accountNumber: '',
      accountHolder: ''
    },
    notes: ''
  },
  {
    order: 3,
    domain: 'expression-of-gratitude.com',
    name: 'フクオカ',
    nameKatakana: '',
    monthlyAmount: 12000,
    paymentCycle: '当月',
    startDate: new Date('2025-06-03'),
    stopDate: null,
    email: '',
    phone: '',
    address: '',
    bankInfo: {
      bankName: '',
      branchName: '',
      accountType: '普通',
      accountNumber: '',
      accountHolder: ''
    },
    notes: ''
  },
  {
    order: 4,
    domain: 'kintarokyuri.com',
    name: '山門',
    nameKatakana: '',
    monthlyAmount: 12000,
    paymentCycle: '当月',
    startDate: new Date('2025-06-08'),
    stopDate: new Date('2025-09-03'),
    status: 'stopped',
    email: '',
    phone: '',
    address: '',
    bankInfo: {
      bankName: '',
      branchName: '',
      accountType: '普通',
      accountNumber: '',
      accountHolder: ''
    },
    notes: ''
  },
  {
    order: 5,
    domain: 'v-fanbox.com',
    name: '濱野江梨子',
    nameKatakana: '',
    monthlyAmount: 2000,
    paymentCycle: '当月',
    startDate: new Date('2025-06-27'),
    stopDate: new Date('2025-07-23'),
    status: 'stopped',
    email: '',
    phone: '',
    address: '',
    bankInfo: {
      bankName: '',
      branchName: '',
      accountType: '普通',
      accountNumber: '',
      accountHolder: ''
    },
    notes: ''
  },
  {
    order: 6,
    domain: 'geinoupanda.com',
    name: 'ナカイ',
    nameKatakana: '',
    monthlyAmount: 10000,
    paymentCycle: '当月',
    startDate: new Date('2025-07-18'),
    stopDate: null,
    email: '',
    phone: '',
    address: '',
    bankInfo: {
      bankName: '',
      branchName: '',
      accountType: '普通',
      accountNumber: '',
      accountHolder: ''
    },
    notes: ''
  },
  {
    order: 7,
    domain: 'osusume-topic.com',
    name: '堀田正彦',
    nameKatakana: '',
    monthlyAmount: 3000,
    paymentCycle: '当月',
    startDate: new Date('2025-07-30'),
    stopDate: null,
    email: '',
    phone: '',
    address: '',
    bankInfo: {
      bankName: '',
      branchName: '',
      accountType: '普通',
      accountNumber: '',
      accountHolder: ''
    },
    notes: ''
  },
  {
    order: 8,
    domain: 'fruit727.com',
    name: '漆間三智子',
    nameKatakana: '',
    monthlyAmount: 13000,
    paymentCycle: '当月',
    startDate: new Date('2025-08-07'),
    stopDate: null,
    email: '',
    phone: '',
    address: '',
    bankInfo: {
      bankName: '',
      branchName: '',
      accountType: '普通',
      accountNumber: '',
      accountHolder: ''
    },
    notes: ''
  },
  {
    order: 9,
    domain: 'nextstep555.com',
    name: '漆間三智子',
    nameKatakana: '',
    monthlyAmount: 5000,
    paymentCycle: '当月',
    startDate: new Date('2025-10-23'),
    stopDate: null,
    email: '',
    phone: '',
    address: '',
    bankInfo: {
      bankName: '',
      branchName: '',
      accountType: '普通',
      accountNumber: '',
      accountHolder: ''
    },
    notes: ''
  },
  {
    order: 10,
    domain: 'nuxyanblog.com',
    name: '阿部恵利香',
    nameKatakana: '',
    monthlyAmount: 16000,
    paymentCycle: '当月',
    startDate: new Date('2025-08-08'),
    stopDate: null,
    email: '',
    phone: '',
    address: '',
    bankInfo: {
      bankName: '',
      branchName: '',
      accountType: '普通',
      accountNumber: '',
      accountHolder: ''
    },
    notes: ''
  },
  {
    order: 11,
    domain: 'linosy.com',
    name: '藤田 佳紀',
    nameKatakana: '',
    monthlyAmount: 19000,
    paymentCycle: '当月',
    startDate: new Date('2025-08-31'),
    stopDate: null,
    email: '',
    phone: '',
    address: '',
    bankInfo: {
      bankName: '',
      branchName: '',
      accountType: '普通',
      accountNumber: '',
      accountHolder: ''
    },
    notes: ''
  },
  {
    order: 12,
    domain: 'www.nishinomiya-city.jp',
    name: '浜 タケシ',
    nameKatakana: '',
    monthlyAmount: 14000,
    paymentCycle: '翌月',
    startDate: new Date('2025-09-06'),
    stopDate: new Date('2025-11-04'),
    status: 'stopped',
    email: '',
    phone: '',
    address: '',
    bankInfo: {
      bankName: '',
      branchName: '',
      accountType: '普通',
      accountNumber: '',
      accountHolder: ''
    },
    notes: ''
  },
  {
    order: 13,
    domain: 'jbs-kinki69.jp',
    name: '浜 タケシ',
    nameKatakana: '',
    monthlyAmount: 19000,
    paymentCycle: '翌月',
    startDate: new Date('2025-09-06'),
    stopDate: null,
    email: '',
    phone: '',
    address: '',
    bankInfo: {
      bankName: '',
      branchName: '',
      accountType: '普通',
      accountNumber: '',
      accountHolder: ''
    },
    notes: ''
  },
  {
    order: 14,
    domain: 'cinemode.jp',
    name: '浜 タケシ',
    nameKatakana: '',
    monthlyAmount: 5000,
    paymentCycle: '翌月',
    startDate: new Date('2025-09-06'),
    stopDate: new Date('2025-11-04'),
    status: 'stopped',
    email: '',
    phone: '',
    address: '',
    bankInfo: {
      bankName: '',
      branchName: '',
      accountType: '普通',
      accountNumber: '',
      accountHolder: ''
    },
    notes: ''
  },
  {
    order: 15,
    domain: 'yuukota-blog.com',
    name: '久谷友起',
    nameKatakana: '',
    monthlyAmount: 5000,
    paymentCycle: '翌月',
    startDate: new Date('2025-09-13'),
    stopDate: null,
    email: '',
    phone: '',
    address: '',
    bankInfo: {
      bankName: '',
      branchName: '',
      accountType: '普通',
      accountNumber: '',
      accountHolder: ''
    },
    notes: ''
  },
  {
    order: 16,
    domain: 'happysmile-life.com',
    name: '毛戸 孝仁',
    nameKatakana: '',
    monthlyAmount: 4000,
    paymentCycle: '翌月',
    startDate: new Date('2025-09-30'),
    stopDate: null,
    email: '',
    phone: '',
    address: '',
    bankInfo: {
      bankName: '',
      branchName: '',
      accountType: '普通',
      accountNumber: '',
      accountHolder: ''
    },
    notes: ''
  },
  {
    order: 17,
    domain: 'tokujouhou.com',
    name: '久野友也',
    nameKatakana: '',
    monthlyAmount: 10000,
    paymentCycle: '翌月',
    startDate: new Date('2025-11-10'),
    stopDate: null,
    email: '',
    phone: '',
    address: '',
    bankInfo: {
      bankName: '',
      branchName: '',
      accountType: '普通',
      accountNumber: '',
      accountHolder: ''
    },
    notes: ''
  },
  {
    order: 18,
    domain: 'haruirolife.com',
    name: '加藤裕之',
    nameKatakana: '',
    monthlyAmount: 11000,
    paymentCycle: '翌月',
    startDate: new Date('2025-11-11'),
    stopDate: null,
    email: '',
    phone: '',
    address: '',
    bankInfo: {
      bankName: '',
      branchName: '',
      accountType: '普通',
      accountNumber: '',
      accountHolder: ''
    },
    notes: ''
  }
];

async function initializePartners() {
  console.log('Connecting to MongoDB...');
  const client = await MongoClient.connect(url, { useUnifiedTopology: true });
  console.log('Connected to MongoDB!');
  
  const db = client.db(dbName);
  const PARTNERS = db.collection('partners');

  try {
    // Check if partners collection already has data
    const existingCount = await PARTNERS.countDocuments();
    
    if (existingCount > 0) {
      console.log(`Partners collection already has ${existingCount} documents.`);
      console.log('Do you want to replace all data? (This will delete existing partners)');
      console.log('To replace, run: node scripts/init-partners.js --force');
      
      if (!process.argv.includes('--force')) {
        console.log('Skipping initialization. Use --force to replace existing data.');
        await client.close();
        return;
      }
      
      console.log('Force flag detected. Deleting existing partners...');
      await PARTNERS.deleteMany({});
      console.log('Existing partners deleted.');
    }

    console.log(`Inserting ${partnersData.length} partners...`);
    
    // Clean up domains (remove http://, https://, www.) and ensure status is set
    const cleanedPartnersData = partnersData.map(partner => {
      let domain = partner.domain || '';
      // Remove http:// or https://
      domain = domain.replace(/^https?:\/\//, '');
      // Remove www. prefix
      domain = domain.replace(/^www\./, '');
      
      // Ensure status is set (default to 'active' if not specified)
      const status = partner.status || (partner.stopDate ? 'stopped' : 'active');
      
      return {
        ...partner,
        domain: domain,
        status: status
      };
    });
    
    // Add timestamps
    const partnersWithTimestamps = cleanedPartnersData.map(partner => ({
      ...partner,
      createdAt: new Date(),
      updatedAt: new Date()
    }));
    
    const result = await PARTNERS.insertMany(partnersWithTimestamps);
    console.log(`Successfully inserted ${result.insertedCount} partners!`);

    // Create index for faster queries
    await PARTNERS.createIndex({ domain: 1 }, { unique: true });
    await PARTNERS.createIndex({ order: 1 });
    console.log('Indexes created.');

    // Print summary
    console.log('\n=== Partner Summary ===');
    console.log(`Total partners: ${cleanedPartnersData.length}`);
    console.log(`Active partners: ${cleanedPartnersData.filter(p => !p.stopDate).length}`);
    console.log(`Stopped partners: ${cleanedPartnersData.filter(p => p.stopDate).length}`);
    
    const totalMonthly = cleanedPartnersData
      .filter(p => !p.stopDate)
      .reduce((sum, p) => sum + p.monthlyAmount, 0);
    console.log(`Total monthly payment (active): ¥${totalMonthly.toLocaleString()}`);

    console.log('\n=== Partners List ===');
    cleanedPartnersData.forEach((p, i) => {
      const status = p.stopDate ? '停止' : '稼働';
      const stopInfo = p.stopDate ? ` (停止: ${p.stopDate.toISOString().split('T')[0]})` : '';
      console.log(`${i + 1}. ${p.domain} - ${p.name} - ¥${p.monthlyAmount.toLocaleString()}/月 [${status}]${stopInfo}`);
    });

  } catch (error) {
    console.error('Error initializing partners:', error);
  } finally {
    await client.close();
    console.log('\nDatabase connection closed.');
  }
}

// Run the initialization
initializePartners()
  .then(() => {
    console.log('\nPartner initialization completed!');
    process.exit(0);
  })
  .catch(error => {
    console.error('Script failed:', error);
    process.exit(1);
  });
