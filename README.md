## About veToken Finance

veToken Finance is an forked version of the convex yield protocol that targets all ve-model projects 

## veToken-contracts

##### keywords
- veAsset projects: the projects which protocols interact with in order to let users get maximum yield from them (Curve, Pickle, Ribbon, Idle, Angle, Balancer)
- veAsset token: the main token of the veAsset project (crv, pickle, rbn, idle, angle, bal)
- veToken: governance token issued by veToken Finance ($VE3D)
- ve3Token: tokenized veAsset token created by veToken finance (ve3CRV, ve3Dill, ve3RBN, ve3IDLE, ve3ANGLE, ve3BAL) 

## Contracts Of Interest
- VeAssetDepositor
  - this contract allows users to lock their veAsset token like crv, pickle, ribbon...etc 
  - users get VE3Token in exchange
  - users can stake VE3Token in the base reward pool
  - the veAsset token deposited to the contract , will be transferred to external locking contract (voting escrow) of each veAsset project by VoterProxy contract 
  - the user who calls the lock function will get some incentives to cover the gas cost 
  - platform gets a reward (fee token) for locking veAsset from veAsset projects from their fee distro contract 
  - for each veAsset project, there will be a dedicated VeAssetDepositor contract deployed.
   
- Booster
  - this contract allows users to deposit lp tokens getting from veAsset projects
  - users get another new token in exchange (token name is concatenated from lp token name + "veToken Deposit")
  - users can stake the new token in the base reward pool 
  - the lp token deposited to the contract, will be transferred to external gauges of each veAsset project by VoterProxy contract 
  - platform gets rewards (as veAsset token) for depositing lp token to gauges 
  - the user who calls the function for collecting the rewards from gauges, will get some incentives to cover the gas cost 
  - the rewards (veAsset token) collected from gauges are distributed 20% max among caller, lock reward pool, ve3d token staker pool , fee platform and ve3d token locking pool , 80% is distributed to reward pools of lp tokens
  - for each veAsset project, there will be a dedicated Booster contract deployed.

- BaseRewardPool
  - this contract allows users to stake their VE3Token which they get when depositing their veAsset token in VeAssetDepositor contract
  - this contract also allows users to stake the new token they get in exchange when depositing lp token to the Booster contract. For each new token representing a lp pool, a new instance of this contract will be created by reward factory contract.
  - for reward pool of VE3token , it collects a portion (configurable) of veAsset token collected from gauges + fee token collected from fee distro contract as extra reward 
  - for reward pool of lp token, it collects no less than 80% of veAsset token collected from gauges   
  - there are extra pools which added to the reward pool for extra reward tokens collected from veAsset project
  - when a user claims rewards , a certain amount of veToken will be minted based on formula  
  - it is one contract instance for each veAsset project , and one for each lp token

- VE3DRewardPool   
  - this contract allows users to stake veToken token 
  - it gets a portion (configurable) of veAsset token collected from gauges for all projects 
  - when a user claim s rewards , the contract will lock his veAsset rewards in VeAssetDepositor contract and mint him VE3Tokens with option to stake them in base reward pool
  - There is only one contract for the platform
 
- VoterProxy
  - this contract handles all deposits into VotingEscrow and into the gauges. This is the address that has the voting power.

- veTokenMinter
  - This contract handles addional rewards when user claim veAsset rewards (PICKLE, CURVE, etc)  
  
## Flow chart

![VeToken Flow for audit](https://user-images.githubusercontent.com/77819086/170293893-6ae4d27f-b21d-42a9-be16-6f2f610191d1.png)

### For ve-model token stakes  (vePickle, veAngle etc)
ve3Token is tokenized for veAsset. And locked veAsset kept in projects’s VotingEscrow .  ve3Token can be obtained by deposit veAsset (Angle, PICKLE, etc) to Depositor.  And user can stake ve3Token through base reward pool to get rewards.   

 
### For liquidity providers

LP tokens are received for depositing assets into veAsset farming pools or liquidity pools ( eg: Deposit liquidity into the angle pool without staking in the angle gauge) . And LP Token then deposited to Booster contracts and receives TOKEN (VE3DlpToken). And this TOKEN can stake into the BaseRewardPool in order to receive boosted rewards. Once deposited in the Booster. The LP tokens will be sent through VoterProxy which then deposits into their corresponding gauges.

Rewards can be harvested by calling earmarkRewards and earmarkFees on the Booster contract for a specific pool. This then calls claimVeAsset
 (claims Fees), claimRewards (claims any additional reward tokens registered for the gauge) and claimFees (claims pool fees from the fee distro). The caller of earmarkRewards and earmarkFees is paid an incentive to do so.


### Voting

Each voting proxy has the voting power for corresponding projects. And it delegates to veToken Fiannce DAO and vote through projects’ snapshot. Voting hashes are set on the VoterProxy through Booster with EIP-1271 signatures 


## Class diagram



![Vetoekn-Finance-CD-Main Contracts](https://user-images.githubusercontent.com/77819086/170214459-c6857ac3-1199-4872-b876-60a65fbd25be.svg)
![Vetoekn-Finance-CD-Reward Contracts](https://user-images.githubusercontent.com/77819086/170215780-a9e9b605-492a-4a04-8069-cea2413b2e98.svg)
![Vetoekn-Finance-CD-Factory](https://user-images.githubusercontent.com/77819086/170216085-2856ddd9-97ef-4e3b-9cca-994bd63e25e5.svg)

# Running tests

### set up

`npm ci`

`truffle compile`

`set up config keys in secret.json based on secret-copy.json`

### deploy idle

`npm run idle_network`

`npm run deploy-basic-contract && npm run deploy-local-idle`

### deploy angle

`npm run angle_network`

`npm run deploy-basic-contract && npm run deploy-local-angle`


### test all

`npm run test-no-deploy`

> **Note:** all deployed addresses will be in contracts.json file
