import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { BrowserRouter as Router, Route } from "react-router-dom";
import PropTypes from 'prop-types';
import AWS from 'aws-sdk';
import aws4 from 'aws4';
import axios from 'axios';
import jwtDecode from 'jwt-decode';
import useWebSocket from 'react-use-websocket';
import uuidv4 from 'uuid/v4';
import moment from 'moment';
import Container from 'react-bootstrap/Container';
import Row from 'react-bootstrap/Row';
import Col from 'react-bootstrap/Col';
import Button from 'react-bootstrap/Button';
import InputGroup from 'react-bootstrap/InputGroup';
import FormControl from 'react-bootstrap/FormControl';
import 'bootstrap/dist/css/bootstrap.min.css';
import './App.css';
const {
  REACT_APP_AWS_REGION: AWS_REGION,
  REACT_APP_ENV: ENV,
  REACT_APP_COGNITO_HOST: COGNITO_HOST,
  REACT_APP_SOCKET_HOST: SOCKET_HOST,
  REACT_APP_USER_POOL_ID: USER_POOL_ID,
  REACT_APP_CLIENT_POOL_ID: CLIENT_POOL_ID
} = process.env;
const COGNITO_API = `https://${COGNITO_HOST}.execute-api.${AWS_REGION}.amazonaws.com/${ENV}`;
const SIGNUP_URL = `${COGNITO_API}/signup`;
const LOGIN_URL = `${COGNITO_API}/login`;
const TEMP_WS_URL = 'wss://echo.websocket.org';
const ACTION = 'sendMessage';
const WEBSOCKET_URL = `${SOCKET_HOST}.execute-api.${AWS_REGION}.amazonaws.com`;
const LOGIN_PROVIDER = `cognito-idp.${AWS_REGION}.amazonaws.com/${USER_POOL_ID}`;

const App = () => (
  <Router>
    <Route exact path="/" component={TheChat} />
  </Router>
)

function TheChat() {
  const [isLoggedIn, setLoggedIn] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [uuid, setUuid] = useState('');
  const [socketUrl, setSocketUrl] = useState(TEMP_WS_URL);
  const [messageHistory, setMessageHistory] = useState([]);

  const [sendMessage, lastMessage, readyState] = useWebSocket(socketUrl);

  const formatMessage = useCallback(
    message =>
      JSON.stringify({ action: ACTION, message, userName: displayName, uuid }),
    [displayName, uuid]
  );
  const handleClickSendMessage = useCallback(
    message => sendMessage(formatMessage(message)),
    [formatMessage, sendMessage]
  );

  useEffect(() => {
    if (lastMessage && lastMessage.data !== null) {
      setMessageHistory(prev => prev.concat(JSON.parse(lastMessage.data)));
    }
  }, [lastMessage]);
  useEffect(() => {
    if (readyState === 1 && socketUrl !== TEMP_WS_URL) {
      setLoggedIn(true);
    }
  }, [readyState, socketUrl]);
  useEffect(() => {
    setUuid(uuidv4());
  }, []);

  return (
    <div className='App'>
      <Container>
        <Row>
          <Col>
            <h1 className='text-center'>ChatApp</h1>
          </Col>
        </Row>
        <Row>
          {isLoggedIn ? (
            <ChatComponent
              sendMessage={handleClickSendMessage}
              messageHistory={messageHistory}
              uuid={uuid}
            />
          ) : (
            <LoginComponent
              setLoggedIn={setLoggedIn}
              setDisplayName={setDisplayName}
              setSocketUrl={setSocketUrl}
            />
          )}
        </Row>
      </Container>
    </div>
  );
}

const ChatComponent = props => {
  const { messageHistory, sendMessage, uuid: Uuid } = props;

  const dateTimeStamp = timestamp =>
    moment(timestamp).format('YYYY-MM-DD HH:mm');

  const messages = useMemo(
    () =>
      messageHistory.map(({ message, userName, uuid, timeStamp }) =>
        uuid === Uuid ? (
          <div key={`${userName}-${timeStamp}`} className='outgoing_msg'>
            <div className='sent_msg'>
              <p>{message}</p>
              <span className='time_date'>{dateTimeStamp(timeStamp)}</span>
            </div>
          </div>
        ) : (
          <div key={`${userName}-${timeStamp}`} className='incoming_msg'>
            <div className='received_msg'>
              <div className='received_withd_msg'>
                <div className='msg_sender'>{userName}</div>
                <p>{message}</p>
                <span className='time_date'>{dateTimeStamp(timeStamp)}</span>
              </div>
            </div>
          </div>
        )
      ),
    [messageHistory, Uuid]
  );

  const [message, setMessage] = useState('');

  const handleSendMessage = () => {
    if (message.length) {
      sendMessage(message);
      setMessage('');
    }
  };
  return (
    <div className='messaging'>
      <div className='inbox_msg'>
        <div className='mesgs'>
          <div className='msg_history'>{messages}</div>
          <div className='type_msg'>
            <div className='input_msg_write'>
              <input
                onChange={({ target: { value } }) => setMessage(value)}
                onKeyDown={({ key }) => key === 'Enter' && handleSendMessage()}
                type='text'
                className='write_msg'
                placeholder='Type a message'
                value={message}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
const loginToCognito = async (Username, Password) => {
  const { data: { AuthenticationResult: { IdToken }}} = await axios.post(LOGIN_URL, { Username, Password });
  AWS.config.region = AWS_REGION;
  AWS.config.credentials = new AWS.CognitoIdentityCredentials({
    IdentityPoolId: CLIENT_POOL_ID,
    region: AWS_REGION,
    Logins: {
      [LOGIN_PROVIDER]: IdToken
    }
  });
  const credentials = await new Promise((resolve, reject) => {
    AWS.config.credentials.refresh(error => {
      if (error) {
        return reject(error);
      }
      return resolve(AWS.config.credentials.data.Credentials);
    });
  });
  const { name: displayName } = jwtDecode(IdToken);
  return {
    ...credentials,
    displayName
  };
};

const LoginComponent = props => {
  const { setDisplayName, setSocketUrl } = props;
  const [signUpStep, setSignUpStep] = useState(0);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [dispName, setDispName] = useState('');
  const [confirmationCode, setConfirmationCode] = useState('');

  const signRequest = (accessKeyId, secretAccessKey, sessionToken) =>
    aws4.sign(
      {
        host: WEBSOCKET_URL,
        path: `/${ENV}?X-Amz-Security-Token=${encodeURIComponent(
          sessionToken
        )}`,
        service: 'execute-api',
        region: AWS_REGION,
        signQuery: true
      },
      {
        accessKeyId,
        secretAccessKey
      }
    );

  const handleLogin = async (Username, Password) => {
    const {
      displayName,
      AccessKeyId,
      SecretKey,
      SessionToken
    } = await loginToCognito(Username, Password);
    const { path } = signRequest(AccessKeyId, SecretKey, SessionToken);
    setSocketUrl(`wss://${WEBSOCKET_URL}${path}`);
    setDisplayName(displayName);
  };

  const signUpRequest = (Email, Password, Name) =>
    axios.post(SIGNUP_URL, { Email, Name, Password });
  const handleSignUp = async (Username, Password, DisplayName) => {
    const {
      data: { UserSub }
    } = await signUpRequest(Username, Password, DisplayName);
    if (UserSub) {
      setSignUpStep(2);
    } else {
      // 'Implement error handling'
    }
  };

  const confirmationRequest = (Username, ConfirmationCode) =>
    axios.put(SIGNUP_URL, { Username, ConfirmationCode });

  const handleConfirmationCode = async (Username, ConfirmationCode) => {
    const { data } = await confirmationRequest(Username, ConfirmationCode);
    if (data.message) {
      // 'Implement error handling'
    } else {
      setUsername('');
      setPassword('');
      setSignUpStep(0);
    }
  };

  return signUpStep === 2 ? (
    <Col>
      <p className='text-center'>Confirm sign up</p>
      <InputGroup>
        <InputGroup.Prepend>
          <InputGroup.Text>{username}</InputGroup.Text>
        </InputGroup.Prepend>
        <FormControl
          placeholder='Confirmation code'
          aria-label='Confirmation code'
          onChange={({ target: { value } }) => setConfirmationCode(value)}
          onKeyDown={({ key }) =>
            key === 'Enter' &&
            handleConfirmationCode(username, confirmationCode)
          }
          value={confirmationCode}
          autoFocus
        />
        <InputGroup.Append>
          <Button
            onClick={() => handleConfirmationCode(username, confirmationCode)}
            variant='primary'
          >
            Confirm
          </Button>
        </InputGroup.Append>
      </InputGroup>
    </Col>
  ) : (
    <Col>
      <p className='text-center'>{signUpStep ? 'Sign up' : 'Login'}</p>
      <InputGroup>
        <FormControl
          placeholder='Username(email)'
          aria-label='Username'
          onChange={({ target: { value } }) => setUsername(value)}
          value={username}
          autoFocus
          type='email'
          name='email'
        />
        <FormControl
          placeholder='Password'
          aria-label='Password'
          onChange={({ target: { value } }) => setPassword(value)}
          onKeyDown={({ key }) =>
            key === 'Enter' && !signUpStep && handleLogin(username, password)
          }
          value={password}
          type='password'
          name='password'
        />
        {!signUpStep ? (
          <InputGroup.Append>
            <Button
              onClick={() => handleLogin(username, password)}
              variant='primary'
            >
              Login
            </Button>
          </InputGroup.Append>
        ) : (
          <>
            <FormControl
              placeholder='Display name'
              aria-label='Name'
              name='name'
              type='text'
              onChange={({ target: { value } }) => setDispName(value)}
              onKeyDown={({ key }) =>
                key === 'Enter' && handleSignUp(username, password, dispName)
              }
              value={dispName}
            />
            <InputGroup.Append>
              <Button
                onClick={() => handleSignUp(username, password, dispName)}
                variant='primary'
              >
                Sign up
              </Button>
            </InputGroup.Append>
          </>
        )}
      </InputGroup>
      {!signUpStep && (
        <Button onClick={() => setSignUpStep(1)} size='sm' variant='link'>
          Give me an account!
        </Button>
      )}
    </Col>
  );
};

ChatComponent.propTypes = {
  messageHistory: PropTypes.arrayOf(PropTypes.oneOfType([PropTypes.object]))
    .isRequired,
  sendMessage: PropTypes.func.isRequired,
  uuid: PropTypes.string.isRequired
};

LoginComponent.propTypes = {
  setDisplayName: PropTypes.func.isRequired,
  setSocketUrl: PropTypes.func.isRequired
};

export default App;
