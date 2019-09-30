ENVIRONMENT ?= dev
STACK_NAME  ?= newchatapp
AWS_REGION  ?= eu-west-1

DEPLOY_BUCKET_STACK_NAME:=$(STACK_NAME)-buckets-$(ENVIRONMENT)
DYNAMODB_STACK_NAME:=$(STACK_NAME)-dynamodb-$(ENVIRONMENT)
COGNITO_STACK_NAME:=$(STACK_NAME)-cognito-$(ENVIRONMENT)
COGNITO_ROLES_STACK_NAME:=$(STACK_NAME)-cognito-roles-$(ENVIRONMENT)
SERVERLESS_ROLES_STACK_NAME:=$(STACK_NAME)-serverless-roles-$(ENVIRONMENT)
SERVERLESS_STACK_NAME:=$(STACK_NAME)-serverless-$(ENVIRONMENT)

#########################################################
################## DEPLOY FULL STACK ####################
#########################################################
.PHONY: deploy_fullstack
deploy_fullstack:
	make deploy_buckets
	make deploy_dynamodb
	make deploy_cognito
	make deploy_serverless_roles
	make deploy_serverless
	make deploy_cognito_roles
	make deploy_frontend
	
#########################################################
#################### DEPLOY BUCKETS #####################
#########################################################
.PHONY: deploy_buckets
deploy_buckets:
	@echo "\n----- AWS deploy bucket start -----\n"
	date
	aws cloudformation deploy \
	--template-file bucket.yaml \
	--stack-name $(DEPLOY_BUCKET_STACK_NAME) \
	--capabilities CAPABILITY_NAMED_IAM \
	--region $(AWS_REGION) \
	--parameter-overrides  \
	Environment=$(ENVIRONMENT) \
	Service=$(STACK_NAME)
	date
	@echo "\n----- AWS deploy bucket done -----\n"

#########################################################
##################### DEPLOY COGNITO ####################
#########################################################
.PHONY: deploy_cognito
deploy_cognito:
	@echo "\n----- AWS deploy cognito start -----\n"
	date
	aws cloudformation deploy \
	--template-file cognito.yaml \
	--stack-name $(COGNITO_STACK_NAME) \
	--capabilities CAPABILITY_NAMED_IAM \
	--region $(AWS_REGION) \
	--parameter-overrides  \
	Environment=$(ENVIRONMENT) \
	Service=$(STACK_NAME)
	date
	@echo "\n----- AWS deploy cognito done -----\n"

#########################################################
################ DEPLOY COGNITO ROLES ###################
#########################################################
.PHONY: deploy_cognito_roles
deploy_cognito_roles:
	@echo "\n----- AWS deploy cognito roles start -----\n"
	@echo "\n----- Get all variables from account -----\n"
	$(eval USERPOOL_ID := $(shell AWS_ACCESS_KEY_ID=${AWS_ACCESS_KEY_ID} AWS_SECRET_ACCESS_KEY=${SECRET_ACCESS_KEY}  aws cognito-idp list-user-pools --max-results 5  --query 'UserPools[?Name==`$(STACK_NAME)-userpool-$(ENVIRONMENT)`].Id' --output text))
	$(eval USERPOOL_CLIENT_ID := $(shell AWS_ACCESS_KEY_ID=${AWS_ACCESS_KEY_ID} AWS_SECRET_ACCESS_KEY=${SECRET_ACCESS_KEY}  aws cognito-idp list-user-pool-clients --max-results 5 --user-pool-id ${USERPOOL_ID} --query 'UserPoolClients[?UserPoolId==`$(USERPOOL_ID)`].ClientId' --output text))
	$(eval IDENTITY_POOL_ID := $(shell AWS_ACCESS_KEY_ID=${AWS_ACCESS_KEY_ID} AWS_SECRET_ACCESS_KEY=${SECRET_ACCESS_KEY} aws cognito-identity list-identity-pools --max-results 5 --query 'IdentityPools[?IdentityPoolName==`$(STACK_NAME)idpool$(ENVIRONMENT)`].IdentityPoolId' --output text))
	$(eval API_ID := $(shell aws apigatewayv2 get-apis --query 'Items[?Name==`$(STACK_NAME)-$(ENVIRONMENT)`].ApiId'  --output text))
	date
	aws cloudformation deploy \
	--template-file cognitoroles.yaml \
	--stack-name $(COGNITO_ROLES_STACK_NAME) \
	--capabilities CAPABILITY_NAMED_IAM \
	--region $(AWS_REGION) \
	--parameter-overrides  \
	Environment=$(ENVIRONMENT) \
	ApiGateway=$(API_ID) \
	IdentityPoolId=$(IDENTITY_POOL_ID) \
	UserPoolId=$(USERPOOL_ID) \
	UserPoolClientId=$(USERPOOL_CLIENT_ID) \
	Service=$(STACK_NAME)
	date
	@echo "\n----- AWS deploy cognito roles done -----\n"

#########################################################
#################### DEPLOY DYNAMODB ####################
#########################################################
.PHONY: deploy_dynamodb
deploy_dynamodb:
	@echo "\n----- AWS deploy dynamodb start -----\n"
	date
	aws cloudformation deploy \
	--template-file dynamodb.yaml \
	--stack-name $(DYNAMODB_STACK_NAME) \
	--capabilities CAPABILITY_NAMED_IAM \
	--region $(AWS_REGION) \
	--parameter-overrides  \
	Environment=$(ENVIRONMENT) \
	Service=$(STACK_NAME)
	date
	@echo "\n----- AWS deploy dynamodb done -----\n"

#########################################################
############## DEPLOY SERVERLESS ROLES ##################
#########################################################
.PHONY: deploy_serverless_roles
deploy_serverless_roles:
	@echo "\n----- AWS deploy serverless roles start -----\n"
	date
	aws cloudformation deploy \
	--template-file iam.yaml \
	--stack-name $(SERVERLESS_ROLES_STACK_NAME) \
	--capabilities CAPABILITY_NAMED_IAM \
	--region $(AWS_REGION) \
	--parameter-overrides  \
	Environment=$(ENVIRONMENT) \
	Service=$(STACK_NAME)
	date
	@echo "\n----- AWS deploy serverless roles done -----\n"

#########################################################
################## DEPLOY SERVERLESS ####################
#########################################################
.PHONY: deploy_serverless
deploy_serverless:
	@echo "\n----- Deploy serverless start -----\n"
	@echo "\n----- Get all variables from account -----\n"
	$(eval USERPOOL_ID := $(shell AWS_ACCESS_KEY_ID=${AWS_ACCESS_KEY_ID} AWS_SECRET_ACCESS_KEY=${SECRET_ACCESS_KEY} aws --region $(AWS_REGION) cognito-idp list-user-pools --max-results 5  --query 'UserPools[?Name==`$(STACK_NAME)-userpool-$(ENVIRONMENT)`].Id' --output text))
	$(eval USERPOOL_CLIENT_ID := $(shell AWS_ACCESS_KEY_ID=${AWS_ACCESS_KEY_ID} AWS_SECRET_ACCESS_KEY=${SECRET_ACCESS_KEY} aws --region $(AWS_REGION) cognito-idp list-user-pool-clients --max-results 5 --user-pool-id ${USERPOOL_ID} --query 'UserPoolClients[?UserPoolId==`$(USERPOOL_ID)`].ClientId' --output text))
	$(eval IDENTITY_POOL_ID := $(shell AWS_ACCESS_KEY_ID=${AWS_ACCESS_KEY_ID} AWS_SECRET_ACCESS_KEY=${SECRET_ACCESS_KEY} aws --region $(AWS_REGION) cognito-identity list-identity-pools --max-results 5 --query 'IdentityPools[?IdentityPoolName==`$(STACK_NAME)idpool$(ENVIRONMENT)`].IdentityPoolId' --output text))	
	@echo "\n----- Deploy serverless start -----\n"
	mkdir -p tmp
	yarn && yarn-recursive
	aws cloudformation package \
	--template-file serverless.yaml \
	--output-template-file tmp/Serverless-template.yaml \
	--s3-bucket $(STACK_NAME)-deploy-$(ENVIRONMENT)
	aws cloudformation deploy \
	--s3-bucket $(STACK_NAME)-deploy-$(ENVIRONMENT) \
	--template-file tmp/Serverless-template.yaml \
	--stack-name $(SERVERLESS_STACK_NAME) \
	--region $(AWS_REGION) \
	--capabilities CAPABILITY_NAMED_IAM \
	--parameter-overrides \
	IdentityPoolId=$(IDENTITY_POOL_ID) \
	UserPoolId=$(USERPOOL_ID) \
	UserPoolClientId=$(USERPOOL_CLIENT_ID) \
	Environment=$(ENVIRONMENT) \
	Service=$(STACK_NAME)
	@echo "\n----- Deploy serverless done -----\n"

.PHONY: redeploy_websocket
redeploy_websocket:
	@echo "\n----- Redeploy API -----\n"
	$(eval SOCKET_ID := $(shell aws --region $(AWS_REGION) apigatewayv2 get-apis --query 'Items[?Name==`$(STACK_NAME)-$(ENVIRONMENT)`].ApiId'  --output text))
	aws --region $(AWS_REGION) apigatewayv2 create-deployment --api-id $(SOCKET_ID) --stage-name $(ENVIRONMENT)

#########################################################
################### DEPLOY FRONTEND #####################
#########################################################
.PHONY: deploy_frontend
deploy_frontend:
	@echo "\n----- AWS deploy frontend start -----\n"
	$(eval API_ID := $(shell aws --region $(AWS_REGION) apigateway get-rest-apis --query 'items[?name==`$(STACK_NAME)-Cognito-$(ENVIRONMENT)`].id'  --output text))
	$(eval SOCKET_ID := $(shell aws --region $(AWS_REGION) apigatewayv2 get-apis --query 'Items[?Name==`$(STACK_NAME)-$(ENVIRONMENT)`].ApiId'  --output text))
	$(eval USERPOOL_ID := $(shell AWS_ACCESS_KEY_ID=${AWS_ACCESS_KEY_ID} AWS_SECRET_ACCESS_KEY=${SECRET_ACCESS_KEY} aws --region $(AWS_REGION) cognito-idp list-user-pools --max-results 5  --query 'UserPools[?Name==`$(STACK_NAME)-userpool-$(ENVIRONMENT)`].Id' --output text))
	$(eval IDENTITY_POOL_ID := $(shell AWS_ACCESS_KEY_ID=${AWS_ACCESS_KEY_ID} AWS_SECRET_ACCESS_KEY=${SECRET_ACCESS_KEY} aws --region $(AWS_REGION) cognito-identity list-identity-pools --max-results 5 --query 'IdentityPools[?IdentityPoolName==`$(STACK_NAME)idpool$(ENVIRONMENT)`].IdentityPoolId' --output text))	
	printf "REACT_APP_ENV=$(ENVIRONMENT)\n\
	REACT_APP_COGNITO_HOST=$(API_ID)\n\
	REACT_APP_SOCKET_HOST=$(SOCKET_ID)\n\
	REACT_APP_AWS_REGION=$(AWS_REGION)\n\
	REACT_APP_USER_POOL_ID=$(USERPOOL_ID)\n\
	REACT_APP_CLIENT_POOL_ID=$(IDENTITY_POOL_ID)" > frontend/.env.production
	printf "REACT_APP_ENV=$(ENVIRONMENT)\n\
	REACT_APP_COGNITO_HOST=$(API_ID)\n\
	REACT_APP_SOCKET_HOST=$(SOCKET_ID)\n\
	REACT_APP_AWS_REGION=$(AWS_REGION)\n\
	REACT_APP_USER_POOL_ID=$(USERPOOL_ID)\n\
	REACT_APP_CLIENT_POOL_ID=$(IDENTITY_POOL_ID)" > frontend/.env.development
	cd frontend && npm run build
	aws s3 sync ./frontend/build s3://$(STACK_NAME)-www-$(ENVIRONMENT)/
	@echo "\n----- AWS deploy frontend finished -----\n"
	@echo "Go to: http://$(STACK_NAME)-www-$(ENVIRONMENT).s3-website-$(AWS_REGION).amazonaws.com/ to test the chat!"