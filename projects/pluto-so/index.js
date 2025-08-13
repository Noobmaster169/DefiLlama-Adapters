const { getProvider, getConnection, getTokenSupplies } = require("../helper/solana");
const { Program } = require("@coral-xyz/anchor");
const PlutosoIDL = require("./idl.json");
const PlutosoV2IDL = require("./idlv2.json");
const { AccountsResolver } = require("@project-serum/anchor/dist/cjs/program/accounts-resolver");

let program
let programV2

function getProgram() {
  if (!program) {
    program = new Program(PlutosoIDL, getProvider());
  }
  return program;
}
function getProgramV2(){
  if (!programV2) {
    programV2 = new Program(PlutosoV2IDL, getProvider());
  }
  return programV2;
}

async function tvl(api) {
  await earnTvl(api)
  await leverageTvl(api)
}

async function borrowed(api) {
  return leverageTvl(api, true)
}

const UNIT_DECIMALS = 6
const INDEX_DECIMALS = 8
const HNST_VAULT = 'C5uSiUij9P6nWUQBDF8CeJQnYQMeKJWhANRDirGHHD28'
const HNST_VAULT_V2 = '4Kh9Djdf13Dn97s6KbiLGNFGYGLyHirEfjhq43rKqqUB'

async function staking(api) {
  const pluto = getProgram()
  const plutoV2 = getProgramV2()

  const earnHnst = await pluto.account.vaultEarn.fetch(HNST_VAULT)
  const earnHnstV2 = await plutoV2.account.earn.fetch(HNST_VAULT_V2)

  let unitHnst = earnHnst.unitSupply.toString() / 1e8
  let indexHnst = earnHnst.index.toString() / 1e12
  let amountHnst = unitHnst * indexHnst
  api.add(earnHnst.tokenMint.toString(), amountHnst * (10 ** earnHnst.tokenDecimal));

  let earnMintSupplies = await getTokenSupplies([earnHnstV2.earnSupplyImint, earnHnstV2.earnSupplyUmint])
  let umintSupply = earnMintSupplies[earnHnstV2.earnSupplyUmint.toString()]
  let imintSupply = earnMintSupplies[earnHnstV2.earnSupplyImint.toString()]
  let borrowUmintSupply = earnMintSupplies[earnHnstV2.earnBorrowUmint.toString()]
  let borrowImintSupply = earnMintSupplies[earnHnstV2.earnBorrowImint.toString()]
  
  let supplyAmount = umintSupply * imintSupply * (10 ** (earnHnstV2.earnTokenDecimals - UNIT_DECIMALS - INDEX_DECIMALS));
  // let borrowAmount = borrowUmintSupply * borrowImintSupply * (10 ** (earnHnstV2.earnTokenDecimals - UNIT_DECIMALS - INDEX_DECIMALS));
  // TO CONFIRM: Whether Earn Token TVL is Supply - Borrow (or read token ATA approach)
  // let earnTokenTVL = supplyAmount - borrowAmount;
  // console.log("HNST Supply Amount:", supplyAmount)
  // console.log("HNST Borrow Amount:", borrowAmount)

  api.add(earnHnstV2.earnTokenMint.toString(), supplyAmount * (10 ** earnHnstV2.earnTokenDecimals));
}

async function earnTvl(api) {
  const pluto = getProgram()
  const plutoV2 = getProgramV2()
  const vaultData = await pluto.account.vaultEarn.all()
  const vaultDataV2 = await plutoV2.account.earn.all()
  vaultData.forEach(({ publicKey, account }) => {
    if (publicKey.toString() === HNST_VAULT) return;
    let unit = (account.unitSupply.toNumber() - account.unitBorrowed.toNumber()) / 1e8
    let index = account.index.toString() / 1e12
    let amount = unit * index
    api.add(account.tokenMint.toString(), amount * (10 ** account.tokenDecimal));
  })

  let earnMints = []
  vaultDataV2.forEach(({account})=> {
    earnMints.push(account.earnSupplyUmint)
    earnMints.push(account.earnSupplyImint)
    earnMints.push(account.earnBorrowUmint)
    earnMints.push(account.earnBorrowImint)
  })
  earnMintSupplies = await getTokenSupplies(earnMints)
  vaultDataV2.forEach(({ publicKey, account }) => {
    if (publicKey.toString() === HNST_VAULT_V2) return;
    const umintSupply = earnMintSupplies[account.earnSupplyUmint.toString()]
    const imintSupply = earnMintSupplies[account.earnSupplyImint.toString()]
    const borrowUmintSupply = earnMintSupplies[account.earnBorrowUmint.toString()]
    const borrowImintSupply = earnMintSupplies[account.earnBorrowImint.toString()]

    let supplyAmount = umintSupply * imintSupply * (10 ** (account.earnTokenDecimals - UNIT_DECIMALS - INDEX_DECIMALS));
    let borrowAmount = borrowUmintSupply * borrowImintSupply * (10 ** (account.earnTokenDecimals - UNIT_DECIMALS - INDEX_DECIMALS));
    // TO CONFIRM: Whether Earn Token TVL is Supply - Borrow (or read token ATA approach)
    let earnTokenTVL = supplyAmount - borrowAmount;
    // console.log("Supply Amount:", supplyAmount)
    // console.log("Borrow Amount:", borrowAmount)
    api.add(account.earnTokenMint.toString(), earnTokenTVL);
  })
}

async function leverageTvl(api, isBorrow = false) {
  const pluto = getProgram()
  const plutoV2 = getProgramV2()
  const connection = getConnection()
  const vaultData = await pluto.account.vaultLeverage.all()
  const vaultDataV2 = await plutoV2.account.leverage.all()
  //console.log(vaultDataV2)
  vaultData.forEach(({ account }) => {
    if (isBorrow) {
      let unit = account.borrowingUnitSupply.toString() / 1e8
      let index = account.borrowingIndex.toString() / 1e12
      let amount = unit * index
      api.add(account.tokenCollateralTokenMint.toString(), amount * (10 ** account.tokenCollateralTokenDecimal));
    } else {
      let unit = account.unitSupply.toString() / 1e8
      let index = account.index.toString() / 1e12
      let amount = unit * index
      api.add(account.nativeCollateralTokenMint.toString(), amount * (10 ** account.nativeCollateralTokenDecimal));
    }
  })

  vaultDataV2.forEach(async ({ account }) => {
    let supplyUnit = account.supplyUnit.toNumber()
    let index = account.index.toNumber()
    let amount = supplyUnit * index
    console.log("Supply Unit:", supplyUnit)
    console.log("Index:", index)
    console.log("Amount:", amount)
    api.add(account.leverageTokenMint.toString(), amount * (10 ** account.leverageTokenDecimals));
  })
}

module.exports = {
  timetravel: false,
  methodology: "The Total Value Locked (TVL) is calculated as the sum of leveraged position assets and the available assets deposited in Earn Vaults.",
  solana: {
    staking,
    tvl,
    // borrowed,
  },
  hallmarks: [
      [1733534040, "Referral-only launch"],
  ]
};
