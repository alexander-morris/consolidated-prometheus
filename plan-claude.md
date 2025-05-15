# Centralized Integration Architecture Plan for Pro-Me-The-Us

## Current Architecture Overview

The current system consists of three main layers:

1. **Coordinator Server** (in `coordinator/middle-server/`): 
   - Acts as a central authority to manage the task queue
   - Provides REST APIs for nodes to consume tasks
   - Contains integration code specific to communicating with nodes

2. **Node Layer** (in `node/planner/` and `node/worker/`):
   - Consumes tasks from the coordinator server
   - Communicates with Docker containers 
   - Contains integration code for both coordinator and Docker container communication

3. **Docker Container** (in `node/worker/orca-agent/` and `node/planner/orca-agent/`):
   - Runs within the node
   - Communicates with the node via REST API
   - Contains integration code for communicating with nodes

## Current Integration Issues

1. Integration code is spread across multiple folders and components
2. Testing is difficult as each component is isolated
3. No centralized integration management
4. Changes to API contracts require updates in multiple places
5. Lack of cohesive integration testing across the system

## Proposed Solution: Centralized Integration Architecture

### 1. Create a Shared Integration Package

Create a new directory `integration/` at the root of the project with the following structure:

```
integration/
├── coordinator/
│   ├── api/            # API interfaces for coordinator
│   ├── client/         # Client library for connecting to coordinator
│   └── models/         # Shared data models
├── node/
│   ├── api/            # API interfaces for node
│   ├── client/         # Client library for connecting to node
│   └── models/         # Shared data models
├── docker/
│   ├── api/            # API interfaces for docker containers
│   ├── client/         # Client library for connecting to containers
│   └── models/         # Shared data models
├── auth/               # Shared authentication utilities
├── tests/              # Integration tests
│   ├── e2e/            # End-to-end tests
│   ├── integration/    # Component integration tests
│   └── mocks/          # Mock services for testing
└── utils/              # Common utilities
```

### 2. Implementation Steps

#### Phase 1: Extract and Centralize API Contracts

1. **Extract API Interfaces**:
   - Analyze `coordinator/middle-server/src/routes/` to define coordinator API interfaces
   - Analyze `node/worker/orca-agent/src/server/routes/` and `node/planner/orca-agent/src/server/routes/` to define Docker container API interfaces
   - Create TypeScript interfaces in `integration/coordinator/api/` and `integration/docker/api/`

2. **Define Shared Data Models**:
   - Identify common data structures used across components
   - Create shared model definitions in `integration/coordinator/models/` and `integration/docker/models/`

3. **Centralize Authentication**:
   - Extract authentication logic from `coordinator/middle-server/src/middleware/auth.ts`
   - Create shared authentication utilities in `integration/auth/`

#### Phase 2: Create Client Libraries

1. **Develop Coordinator Client**:
   - Create a TypeScript client library in `integration/coordinator/client/`
   - Implement methods for all coordinator API endpoints
   - Include request validation and error handling

2. **Develop Node Client**:
   - Create a TypeScript client library in `integration/node/client/`
   - Implement methods for interacting with the node's endpoints

3. **Develop Docker Client**:
   - Create a TypeScript/Python client library in `integration/docker/client/`
   - Implement methods for all Docker container API endpoints
   - Support both TypeScript and Python interfaces

#### Phase 3: Integration Testing Framework

1. **Setup Testing Infrastructure**:
   - Create mock implementations of each component
   - Setup Docker Compose configuration for integration testing
   - Implement test helpers and utilities

2. **Develop Integration Tests**:
   - Create end-to-end scenarios testing full system flow
   - Develop component integration tests for each pair of components
   - Implement performance and load tests

3. **Continuous Integration**:
   - Configure GitHub Actions to run integration tests
   - Implement test coverage reporting
   - Set up automated testing for PRs

#### Phase 4: Refactor Existing Components

1. **Update Coordinator**:
   - Refactor `coordinator/middle-server/` to use shared models and interfaces
   - Update route handlers to implement the standardized API interfaces
   - Replace custom authentication with shared auth utilities

2. **Update Node Components**:
   - Refactor `node/planner/` and `node/worker/` to use the coordinator client library
   - Update Docker container communication to use the Docker client library
   - Ensure all interactions follow standardized patterns

3. **Update Docker Containers**:
   - Refactor container code to implement standardized API interfaces
   - Update authentication to use shared auth utilities
   - Ensure container-to-node communication follows standards

### 3. Technical Specifications

#### API Standardization

1. **REST API Guidelines**:
   - All endpoints follow RESTful naming conventions
   - Consistent error response format
   - Standard authentication headers
   - Comprehensive OpenAPI/Swagger documentation

2. **Request/Response Formats**:
   - Use TypeScript interfaces to ensure type safety
   - Implement schema validation using Zod or similar library
   - Consistent error handling patterns

3. **Authentication**:
   - Implement JWT-based authentication
   - Create shared token validation utilities
   - Support both bearer token and signature-based auth methods

#### Testing Strategy

1. **Unit Testing**:
   - Test individual client libraries in isolation
   - Mock external dependencies for deterministic tests
   - Achieve >90% code coverage for client libraries

2. **Integration Testing**:
   - Test pairs of components (coordinator-node, node-docker)
   - Use mock services to isolate component pairs
   - Verify contract compliance between components

3. **End-to-End Testing**:
   - Test complete workflows from coordinator to Docker container
   - Verify data integrity across the entire system
   - Test failure scenarios and error handling

### 4. Deployment Considerations

1. **Versioning**:
   - Use semantic versioning for the integration package
   - Ensure backward compatibility or provide migration paths
   - Document breaking changes clearly

2. **Packaging**:
   - Publish the integration package to npm registry
   - Support installation as a dependency in each component
   - Consider monorepo structure for development

3. **Documentation**:
   - Generate API documentation from code
   - Create usage examples for each client library
   - Document integration patterns and best practices

## Implementation Timeline

### Week 1-2: Analysis and Design
- [ ] Analyze existing integration code in all components
- [ ] Define API interfaces and data models
- [ ] Design client library architecture
- [ ] Create detailed technical specifications

### Week 3-4: Extract and Centralize API Contracts
- [ ] Implement shared data models
- [ ] Create API interfaces
- [ ] Develop authentication utilities
- [ ] Write unit tests for models and utilities

### Week 5-6: Develop Client Libraries
- [ ] Implement coordinator client library
- [ ] Implement node client library
- [ ] Implement Docker client library
- [ ] Write unit tests for all client libraries

### Week 7-8: Integration Testing Framework
- [ ] Set up testing infrastructure
- [ ] Create mock implementations
- [ ] Develop integration tests
- [ ] Configure continuous integration

### Week 9-10: Refactor Existing Components
- [ ] Update coordinator server
- [ ] Update node components
- [ ] Update Docker containers
- [ ] Verify functionality

### Week 11-12: Documentation and Finalization
- [ ] Generate API documentation
- [ ] Create usage examples
- [ ] Write integration guides
- [ ] Conduct final testing

## Benefits of this Approach

1. **Centralized Management**: All integration code is in one place
2. **Consistency**: Standardized interfaces across the system
3. **Testing**: Comprehensive integration testing
4. **Maintainability**: Changes to API contracts only need to be made once
5. **Flexibility**: Components can evolve independently as long as they adhere to the interfaces
6. **Documentation**: Single source of truth for API contracts

## Next Steps

1. Conduct a detailed analysis of existing integration points
2. Create a proof-of-concept implementation of shared models
3. Develop a simple client library for one API endpoint
4. Set up a basic integration test framework
