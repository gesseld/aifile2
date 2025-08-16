# Subscription Service Architecture

## Overview

FastAPI-based service for managing subscription plans and user subscriptions.

## Components

### Models

- **Plan**: Subscription plans with features and pricing
- **Subscription**: User subscriptions to plans
- **Entitlement**: Feature access permissions

### Endpoints

- `/plans`: CRUD for subscription plans
- `/subscriptions`: CRUD for user subscriptions
- `/entitlements/:userId`: Get user's feature entitlements

### Events

- `subscription.changed`: Published when subscription status changes

## Dependencies

- FastAPI
- SQLAlchemy
- Redis (for events)
- Shared database with auth service
